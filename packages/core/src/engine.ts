import path from "node:path";
import {
  type Finding,
  FindingSchema,
  normalizeWhitespace,
  SEVERITY_ORDER,
  type Severity,
  severityAtLeast,
  shortHash,
  type TokenwiseConfig,
  UsageError,
} from "@tokenwise/shared";
import { isAlwaysLoaded, parseStructured } from "./classify.ts";
import type { CodeFile, DiscoveredFile } from "./discovery.ts";
import { parseDocument } from "./document.ts";
import type { LineEdit } from "./edits.ts";
import { ALL_RULES } from "./rules/all.ts";
import type { FileContext, Rule } from "./rules/index.ts";
import type { TokenCounter } from "./tokens.ts";

export function buildFileContexts(files: DiscoveredFile[], targetRepoPath: string): FileContext[] {
  const targetDir = targetRepoPath === "." ? "" : targetRepoPath;
  return files.map((file) => {
    const isProse = !/\.(json|ya?ml)$/i.test(file.path);
    const dir = path.posix.dirname(file.path);
    const isRoot = (dir === "." ? "" : dir) === targetDir || file.path === targetRepoPath;
    const fc: FileContext = {
      file,
      doc: parseDocument(isProse ? file.file.text : ""),
      isProse,
      alwaysLoaded: isAlwaysLoaded(file.path),
      isRoot,
    };
    if (!isProse) fc.structured = parseStructured(file.path, file.file.text);
    return fc;
  });
}

export interface AuditOptions {
  config: TokenwiseConfig;
  codeFiles?: CodeFile[];
  counter: TokenCounter;
  rules?: readonly Rule[];
  only?: string[];
  exclude?: string[];
  minSeverity?: Severity;
}

export interface AuditFinding extends Finding {
  edits?: LineEdit[];
}

export function selectRules(
  all: readonly Rule[],
  config: TokenwiseConfig,
  only?: string[],
  exclude?: string[],
): Rule[] {
  const known = new Set(all.map((r) => r.id));
  for (const id of [...(only ?? []), ...(exclude ?? [])]) {
    if (!known.has(id))
      throw new UsageError(`Unknown rule id: ${id}`, [`Known rules: ${[...known].join(", ")}`]);
  }
  return all.filter(
    (r) =>
      !config.rules.disabled.includes(r.id) &&
      (!only?.length || only.includes(r.id)) &&
      !exclude?.includes(r.id),
  );
}

export async function runAudit(contexts: FileContext[], opts: AuditOptions): Promise<AuditFinding[]> {
  const rules = selectRules(opts.rules ?? ALL_RULES, opts.config, opts.only, opts.exclude);
  const ctx = {
    files: contexts,
    codeFiles: opts.codeFiles ?? [],
    config: opts.config,
    counter: opts.counter,
  };
  const findings: AuditFinding[] = [];
  for (const rule of rules) {
    for (const d of await rule.detect(ctx)) {
      const { idKey, edits, ...rest } = d;
      const finding: AuditFinding = {
        // Stable id: rule + file + (idKey when the rule supplies one, else normalized evidence). Rules pass an idKey
        // when their evidence contains measurements or line numbers that change after unrelated edits.
        id: `${rule.id}-${shortHash(`${rule.id}\u0000${d.file}\u0000${idKey ?? normalizeWhitespace(d.evidence)}`)}`,
        ruleId: rule.id,
        category: rule.category,
        ...rest,
        autoFixable: rule.fixable && d.autoFixable,
      };
      FindingSchema.parse(finding);
      if (edits && finding.autoFixable) finding.edits = edits;
      findings.push(finding);
    }
  }
  const filtered = opts.minSeverity
    ? findings.filter((f) => severityAtLeast(f.severity, opts.minSeverity as Severity))
    : findings;
  return filtered.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.file.localeCompare(b.file) ||
      (a.range?.startLine ?? 0) - (b.range?.startLine ?? 0) ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

/** Strips internal fields for output. */
export function publicFinding(f: AuditFinding): Finding {
  const { edits: _edits, ...rest } = f;
  return rest;
}
