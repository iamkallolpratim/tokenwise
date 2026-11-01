import { existsSync, promises as fs, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyWithBackup,
  buildFileContexts,
  classify,
  discover,
  loadConfig,
  publicFinding,
  runAudit,
  TokenCounter,
  unifiedDiff,
} from "@tokenwise/core";
import { editedPaths, type HookScope, type HookTarget, planHook } from "@tokenwise/integrations";
import {
  type Finding,
  isSecretFile,
  redact,
  type Severity,
  SeveritySchema,
  severityAtLeast,
  toPosix,
  toRepoPath,
  UsageError,
} from "@tokenwise/shared";
import type { Command } from "commander";
import { globals, resolveCwd } from "../context.ts";
import { createOutput, printJson } from "../output/io.ts";

const MAX_STDIN_BYTES = 1024 * 1024;
const MAX_CONTEXT_CHARS = 800;

function parseTarget(t: string): HookTarget {
  if (t !== "claude" && t !== "codex") throw new UsageError(`--target must be claude or codex, got ${t}`);
  return t;
}

export function registerHook(program: Command): void {
  const hook = program
    .command("hook")
    .description("Optional read-only agent hooks (opt-in; never rewrite files)");

  hook
    .command("install")
    .description("Add or remove the TokenWise PostToolUse hook (dry run unless --apply)")
    .requiredOption("--target <target>", "claude or codex")
    .requiredOption("--scope <scope>", "project, local (Claude Code only) or user")
    .option("--remove", "remove TokenWise's hook entry instead of adding it")
    .option(
      "--command <cmd>",
      "command the hook runs (default: npx --no-install @klawde91/tokenwise hook run ...)",
    )
    .option("--apply", "write the settings file (with backup)")
    .option("--format <format>", "text or json", "text")
    .action(
      async (
        opts: {
          target: string;
          scope: string;
          remove?: boolean;
          command?: string;
          apply?: boolean;
          format: string;
        },
        cmd: Command,
      ) => {
        const target = parseTarget(opts.target);
        if (!["project", "local", "user"].includes(opts.scope))
          throw new UsageError(`--scope must be project, local or user, got ${opts.scope}`);
        const g = globals(cmd);
        const projectRoot = resolveCwd(g);
        const out = createOutput(g);
        const home = process.env.TOKENWISE_HOME ?? os.homedir();
        const plan = await planHook({
          target,
          scope: opts.scope as HookScope,
          projectRoot,
          home,
          ...(opts.remove ? { remove: true } : {}),
          ...(opts.command ? { command: opts.command } : {}),
        });
        const shown = opts.scope === "user" ? toPosix(plan.file) : plan.relPath;
        const diff = plan.changed
          ? unifiedDiff(shown, plan.before?.toString("utf8") ?? "", plan.after.toString("utf8"))
          : "";
        let backupId: string | null = null;
        if (opts.apply && plan.changed) {
          const mode = plan.before ? statSync(plan.file).mode & 0o777 : 0o644;
          backupId = (
            await applyWithBackup(
              plan.backupRoot,
              [{ path: plan.relPath, before: plan.before, after: plan.after, mode }],
              `hook install --target ${target} --scope ${opts.scope}${opts.remove ? " --remove" : ""}`,
            )
          ).id;
        }
        const undo = backupId
          ? `tokenwise restore ${backupId}${opts.scope === "user" ? ` --cwd ${toPosix(plan.backupRoot)}` : ""}`
          : null;
        if (opts.format === "json") {
          printJson({
            schemaVersion: 1,
            target,
            scope: opts.scope,
            file: shown,
            action: opts.remove ? "remove" : "install",
            changed: plan.changed,
            applied: Boolean(backupId),
            backupId,
            diff,
          });
          return;
        }
        if (!plan.changed) {
          out.out(
            opts.remove
              ? `No TokenWise hook in ${shown}; nothing to remove.`
              : `${shown} already has the TokenWise hook; nothing to change.`,
          );
          return;
        }
        out.out(diff);
        if (backupId) out.out(`Applied to ${shown}. Backup: ${backupId} (undo with: ${undo})`);
        else out.out("Dry run: nothing was written. Re-run with --apply to write this change.");
        if (!opts.remove && target === "codex")
          out.out("Codex loads project hooks only when the project's .codex/ layer is trusted.");
      },
    );

  hook
    .command("run")
    .description("Hook entry point: reads the PostToolUse payload on stdin; always exits 0")
    .requiredOption("--target <target>", "claude or codex")
    .option("--min-severity <severity>", "lowest severity to report back to the agent", "high")
    .option("--timeout-ms <ms>", "give up silently after this many milliseconds", "5000")
    .action(async (opts: { target: string; minSeverity: string; timeoutMs: string }, cmd: Command) => {
      const g = globals(cmd);
      const debug = (msg: string) => {
        if (g.verbose) process.stderr.write(`tokenwise hook: ${msg}\n`);
      };
      // Non-blocking on failure: every error path exits 0 with no stdout.
      try {
        parseTarget(opts.target);
        const min = SeveritySchema.parse(opts.minSeverity.toUpperCase());
        const timeout = Math.max(100, Number(opts.timeoutMs) || 5000);
        const result = await Promise.race([
          runHook(min, resolveCwd(g)),
          new Promise<null>((r) => setTimeout(() => r(null), timeout).unref()),
        ]);
        if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
        else debug("no output");
      } catch (e) {
        debug(e instanceof Error ? e.message : String(e));
      }
      // Exit now so an audit still running after the timeout cannot keep the harness waiting.
      await new Promise<void>((r) => process.stdout.write("", () => r()));
      process.exit(0);
    });
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += b.length;
    if (size > MAX_STDIN_BYTES) throw new Error("hook payload too large");
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Audits the instruction files the tool just wrote; returns hook JSON only when there is something to say. */
async function runHook(min: Severity, fallbackCwd: string): Promise<object | null> {
  const raw = await readStdin();
  if (!raw.trim()) return null;
  const payload: unknown = JSON.parse(raw);
  const p = payload as { cwd?: unknown; hook_event_name?: unknown };
  if (p.hook_event_name !== undefined && p.hook_event_name !== "PostToolUse") return null;
  const root =
    typeof p.cwd === "string" && existsSync(p.cwd) && statSync(p.cwd).isDirectory()
      ? path.resolve(p.cwd)
      : fallbackCwd;
  const { config } = loadConfig({ cwd: root, flags: {} });
  const counter = new TokenCounter(config.defaultModel ?? undefined);
  const findings: Finding[] = [];
  const files: string[] = [];
  for (const edited of editedPaths(payload)) {
    const abs = path.resolve(root, edited);
    const rel = path.relative(root, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel) || !existsSync(abs) || !statSync(abs).isFile()) continue;
    const repoPath = toRepoPath(root, abs);
    if (isSecretFile(repoPath)) continue;
    if (!classify(repoPath, await fs.readFile(abs, "utf8"))) continue;
    const { files: discovered } = await discover({ config, target: abs, root });
    if (!discovered.length) continue;
    const audit = await runAudit(buildFileContexts(discovered, repoPath), { config, counter });
    files.push(repoPath);
    findings.push(...audit.map(publicFinding).filter((f) => severityAtLeast(f.severity, min)));
  }
  if (!findings.length) return null;
  const lines = findings
    .slice(0, 3)
    .map(
      (f) =>
        `- ${f.severity} ${f.ruleId} ${f.file}${f.range ? `:${f.range.startLine}` : ""}: ${f.description}`,
    );
  const more = findings.length > 3 ? `\n- …and ${findings.length - 3} more` : "";
  let text = `TokenWise (read-only check): ${findings.length} token-efficiency finding(s) at ${min} or above in ${files.join(", ")}:\n${lines.join("\n")}${more}\nDetails: npx @klawde91/tokenwise audit ${files[0]}`;
  text = redact(text);
  if (text.length > MAX_CONTEXT_CHARS) text = `${text.slice(0, MAX_CONTEXT_CHARS - 1)}…`;
  return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } };
}
