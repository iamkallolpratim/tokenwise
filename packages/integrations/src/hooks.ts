import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { toPosix, UsageError } from "@tokenwise/shared";

/**
 * Optional hooks (Section 13): opt-in, read-only, bounded by a timeout, non-blocking on failure.
 * Locations and schema verified 2026-10-31 (website: Project > Sources):
 * - Claude Code: https://code.claude.com/docs/en/hooks — settings.json `hooks.PostToolUse[]`
 *   with `matcher` (tool_name) and `hooks: [{type: "command", command, timeout}]`.
 * - Codex: https://learn.chatgpt.com/docs/hooks — `.codex/hooks.json` / `~/.codex/hooks.json`,
 *   same event → matcher group → handler shape; apply_patch matches `apply_patch|Edit|Write`.
 */
export type HookTarget = "claude" | "codex";
export type HookScope = "project" | "local" | "user";

/** Marker used to find (and only ever touch) TokenWise's own hook entries. */
export const HOOK_MARKER = "tokenwise hook run";
/** Seconds the harness waits before killing the hook; the hook itself gives up sooner. */
export const HOOK_TIMEOUT_SECONDS = 10;

const MATCHER: Record<HookTarget, string> = { claude: "Edit|Write", codex: "apply_patch" };

export function defaultHookCommand(target: HookTarget): string {
  return `npx --no-install @klawde91/tokenwise hook run --target ${target}`;
}

export function hookFile(target: HookTarget, scope: HookScope, projectRoot: string, home: string): string {
  if (target === "claude") {
    if (scope === "user") return path.join(home, ".claude", "settings.json");
    return path.join(projectRoot, ".claude", scope === "local" ? "settings.local.json" : "settings.json");
  }
  if (scope === "local") throw new UsageError("Codex has no local hooks scope; use project or user.");
  return path.join(scope === "user" ? home : projectRoot, ".codex", "hooks.json");
}

export interface HookPlan {
  target: HookTarget;
  scope: HookScope;
  file: string;
  /** Directory whose .tokenwise/backups holds the backup (project root, or home for user scope). */
  backupRoot: string;
  /** file relative to backupRoot, POSIX separators. */
  relPath: string;
  before: Buffer | null;
  after: Buffer;
  changed: boolean;
  installed: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function isOurs(handler: unknown): boolean {
  return isObj(handler) && typeof handler.command === "string" && handler.command.includes(HOOK_MARKER);
}

/** Removes TokenWise handlers (and groups left empty by that); leaves everything else as it was. */
function stripOurs(hooks: Obj): void {
  const groups = hooks.PostToolUse;
  if (!Array.isArray(groups)) return;
  const kept = groups.flatMap((g) => {
    if (!isObj(g) || !Array.isArray(g.hooks) || !g.hooks.some(isOurs)) return [g];
    const rest = g.hooks.filter((h) => !isOurs(h));
    return rest.length ? [{ ...g, hooks: rest }] : [];
  });
  if (kept.length) hooks.PostToolUse = kept;
  else delete hooks.PostToolUse;
}

export async function planHook(opts: {
  target: HookTarget;
  scope: HookScope;
  projectRoot: string;
  home: string;
  remove?: boolean;
  command?: string;
}): Promise<HookPlan> {
  if (opts.command !== undefined && !opts.command.includes(HOOK_MARKER))
    throw new UsageError(
      `--command must run "${HOOK_MARKER}" so TokenWise can find and remove its entry later.`,
    );
  const file = hookFile(opts.target, opts.scope, opts.projectRoot, opts.home);
  const backupRoot = opts.scope === "user" ? opts.home : opts.projectRoot;
  const before = existsSync(file) ? await fs.readFile(file) : null;
  let doc: Obj = {};
  let eol = "\n";
  if (before) {
    const text = before.toString("utf8").replace(/^﻿/, "");
    if (text.includes("\r\n")) eol = "\r\n";
    let parsed: unknown;
    try {
      parsed = text.trim() ? JSON.parse(text) : {};
    } catch {
      throw new UsageError(`${file} is not valid JSON; fix it by hand before installing the hook.`);
    }
    if (!isObj(parsed)) throw new UsageError(`${file} must contain a JSON object.`);
    doc = parsed;
  }
  if (doc.hooks !== undefined && !isObj(doc.hooks))
    throw new UsageError(`"hooks" in ${file} is not an object; refusing to modify it.`);
  const hooks: Obj = isObj(doc.hooks) ? doc.hooks : {};
  stripOurs(hooks);
  if (!opts.remove) {
    const groups = Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : [];
    groups.push({
      matcher: MATCHER[opts.target],
      hooks: [
        {
          type: "command",
          command: opts.command ?? defaultHookCommand(opts.target),
          timeout: HOOK_TIMEOUT_SECONDS,
        },
      ],
    });
    hooks.PostToolUse = groups;
  }
  if (Object.keys(hooks).length) doc.hooks = hooks;
  else delete doc.hooks;
  const bom = before && before[0] === 0xef && before[1] === 0xbb && before[2] === 0xbf ? "﻿" : "";
  const after = Buffer.from(`${bom}${JSON.stringify(doc, null, 2).replace(/\n/g, eol)}${eol}`, "utf8");
  const changed = before === null ? !opts.remove : !before.equals(after);
  return {
    target: opts.target,
    scope: opts.scope,
    file,
    backupRoot,
    relPath: toPosix(path.relative(backupRoot, file)),
    before,
    after,
    changed,
    installed: !opts.remove,
  };
}

/** Repo paths a PostToolUse payload says were written. Codex apply_patch input shape: UNVERIFIED. */
export function editedPaths(payload: unknown): string[] {
  if (!isObj(payload) || !isObj(payload.tool_input)) return [];
  const input = payload.tool_input;
  const out = new Set<string>();
  for (const k of ["file_path", "path"]) {
    const v = input[k];
    if (typeof v === "string" && v) out.add(v);
  }
  const visit = (v: unknown, depth: number): void => {
    if (depth > 3) return;
    if (typeof v === "string") {
      for (const m of v.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm)) if (m[1]) out.add(m[1].trim());
      for (const m of v.matchAll(/^\*\*\* Move to: (.+)$/gm)) if (m[1]) out.add(m[1].trim());
    } else if (Array.isArray(v)) for (const x of v) visit(x, depth + 1);
    else if (isObj(v)) for (const x of Object.values(v)) visit(x, depth + 1);
  };
  visit(input, 0);
  return [...out];
}
