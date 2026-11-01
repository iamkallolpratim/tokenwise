import { promises as fs } from "node:fs";
import path from "node:path";
import { type FileCategory, isSecretFile, type TokenwiseConfig, toRepoPath } from "@tokenwise/shared";
import fg from "fast-glob";
import ignore, { type Ignore } from "ignore";
import { type Classification, classify } from "./classify.ts";
import { decode, isProbablyBinary, type TextFile } from "./fileio.ts";

export interface DiscoveredFile {
  /** Repo-relative, forward slashes. */
  path: string;
  absolutePath: string;
  category: FileCategory;
  reasons: string[];
  sizeBytes: number;
  file: TextFile;
}

export interface SkippedFile {
  path: string;
  reason: "ignored" | "secret" | "binary" | "too-large" | "unreadable";
}

export interface DiscoveryResult {
  root: string;
  files: DiscoveredFile[];
  skipped: SkippedFile[];
  /** Candidate files examined but not AI-relevant. */
  notRelevant: number;
}

interface GitIgnoreScope {
  dir: string;
  ig: Ignore;
}

async function loadIgnoreScopes(root: string): Promise<GitIgnoreScope[]> {
  const files = await fg(["**/.gitignore", ".tokenwiseignore"], {
    cwd: root,
    dot: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
    followSymbolicLinks: false,
  });
  const scopes: GitIgnoreScope[] = [];
  for (const rel of files.sort()) {
    const content = await fs.readFile(path.join(root, rel), "utf8").catch(() => "");
    const dir = path.posix.dirname(rel);
    scopes.push({ dir: dir === "." ? "" : dir, ig: ignore().add(content) });
  }
  return scopes;
}

function isIgnored(scopes: GitIgnoreScope[], repoPath: string): boolean {
  for (const { dir, ig } of scopes) {
    if (dir && !repoPath.startsWith(`${dir}/`)) continue;
    const rel = dir ? repoPath.slice(dir.length + 1) : repoPath;
    if (ig.ignores(rel)) return true;
  }
  return false;
}

export interface DiscoverOptions {
  config: TokenwiseConfig;
  /** Scan target: directory or single file. */
  target: string;
  /** Repository root used for relative paths and .gitignore lookup. */
  root: string;
  onProgress?: (done: number, total: number) => void;
}

/** A path counts as explicitly included when it is the scan target itself or a literal (non-glob) include. */
function explicitIncludes(config: TokenwiseConfig, root: string, target: string): Set<string> {
  const set = new Set<string>();
  for (const inc of config.include) if (!fg.isDynamicPattern(inc)) set.add(inc.replace(/^\.\//, ""));
  set.add(toRepoPath(root, target));
  return set;
}

export async function discover(opts: DiscoverOptions): Promise<DiscoveryResult> {
  const { config, root } = opts;
  const target = path.resolve(opts.target);
  const st = await fs.stat(target);
  const explicit = explicitIncludes(config, root, target);
  let candidates: string[];
  if (st.isFile()) {
    candidates = [toRepoPath(root, target)];
  } else {
    const base = toRepoPath(root, target);
    const prefix = base === "." ? "" : `${base}/`;
    const literal = [...explicit].filter((p) => p !== base);
    const found = await fg(config.include, {
      cwd: target,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: config.exclude,
      caseSensitiveMatch: true,
    });
    candidates = [
      ...new Set([...found.map((f) => prefix + f), ...literal.filter((l) => l.startsWith(prefix))]),
    ];
  }
  candidates.sort();

  const scopes = await loadIgnoreScopes(root);
  const files: DiscoveredFile[] = [];
  const skipped: SkippedFile[] = [];
  let notRelevant = 0;
  let done = 0;
  for (const rel of candidates) {
    done++;
    opts.onProgress?.(done, candidates.length);
    const isExplicit = explicit.has(rel);
    if (!isExplicit && isIgnored(scopes, rel)) {
      skipped.push({ path: rel, reason: "ignored" });
      continue;
    }
    if (!isExplicit && isSecretFile(rel)) {
      skipped.push({ path: rel, reason: "secret" });
      continue;
    }
    const abs = path.join(root, ...rel.split("/"));
    let buf: Buffer;
    let size: number;
    try {
      const s = await fs.lstat(abs);
      if (!s.isFile()) continue;
      size = s.size;
      if (size > config.maxFileSizeBytes) {
        skipped.push({ path: rel, reason: "too-large" });
        continue;
      }
      buf = await fs.readFile(abs);
    } catch {
      skipped.push({ path: rel, reason: "unreadable" });
      continue;
    }
    if (isProbablyBinary(buf)) {
      skipped.push({ path: rel, reason: "binary" });
      continue;
    }
    const decoded = decode(buf);
    // A file named directly as the scan target is analyzed even when it carries no prompt signals.
    const cls: Classification | null =
      classify(rel, decoded.text) ??
      (st.isFile() ? { category: "other-relevant", reasons: ["explicit target"] } : null);
    if (!cls) {
      notRelevant++;
      continue;
    }
    const mode = (await fs.stat(abs)).mode & 0o7777;
    files.push({
      path: rel,
      absolutePath: abs,
      category: cls.category,
      reasons: cls.reasons,
      sizeBytes: size,
      file: { ...decoded, mode },
    });
  }
  return { root, files, skipped, notRelevant };
}

export interface CodeFile {
  path: string;
  text: string;
}

/** Signals that a source file talks to an LLM. Only such files are kept for LOOP/CACHE rules. */
export const MODEL_CALL =
  /\b(?:callModel|callLLM|chat\.completions\.create|responses\.create|messages\.create|generateText|streamText|generateObject|ChatCompletion\.create|\.invoke\(|llm\.(?:predict|complete|chat)|completion\()/;

/** Discovers JS/TS/Python files that call a model. Honors excludes, .gitignore and secret-file rules. */
export async function discoverCode(opts: {
  config: TokenwiseConfig;
  target: string;
  root: string;
}): Promise<CodeFile[]> {
  const target = path.resolve(opts.target);
  const st = await fs.stat(target);
  if (st.isFile()) return [];
  const base = toRepoPath(opts.root, target);
  const prefix = base === "." ? "" : `${base}/`;
  const found = await fg(opts.config.codeInclude, {
    cwd: target,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: [...opts.config.exclude, "**/node_modules/**", "**/*.d.ts", "**/*.min.js"],
  });
  const scopes = await loadIgnoreScopes(opts.root);
  const out: CodeFile[] = [];
  for (const f of found.sort()) {
    const rel = prefix + f;
    if (isIgnored(scopes, rel) || isSecretFile(rel)) continue;
    const abs = path.join(opts.root, ...rel.split("/"));
    const s = await fs.stat(abs);
    if (s.size > opts.config.maxFileSizeBytes) continue;
    const buf = await fs.readFile(abs);
    if (isProbablyBinary(buf)) continue;
    const text = decode(buf).text;
    if (MODEL_CALL.test(text)) out.push({ path: rel, text });
  }
  return out;
}
