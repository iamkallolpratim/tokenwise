import {
  AI_LABEL,
  applyWithBackup,
  encode,
  optimizeFiles,
  type PlannedWrite,
  proposeAiRewrites,
  providerFor,
} from "@tokenwise/core";
import { AbortedError, formatInt, toRepoPath, UsageError } from "@tokenwise/shared";
import { estimateTokens } from "@tokenwise/tokenizers";
import type { Command } from "commander";
import { confirm, requireEgressConsent } from "../consent.ts";
import { type CommandContext, createContext, createCounter } from "../context.ts";
import { discoverFor } from "../discover.ts";
import { location } from "../output/findings.ts";
import { printJson } from "../output/io.ts";
import { renderTable } from "../output/table.ts";

interface OptimizeOpts {
  apply?: boolean;
  allowExternal?: boolean;
  yes?: boolean;
  mode: string;
  rule?: string[];
  format: string;
  model?: string;
}

export function registerOptimize(program: Command): void {
  program
    .command("optimize [path]")
    .description("Preview (default) or apply deterministic, protection-checked fixes")
    .option("--apply", "write changes (with backup); without it nothing is modified")
    .option(
      "--mode <mode>",
      "deterministic or ai (ai sends content to a model; off by default)",
      "deterministic",
    )
    .option("--allow-external", "permit --mode ai to call a model provider")
    .option(
      "--yes",
      "confirm external calls and AI-proposed changes without a prompt (required when not a TTY)",
    )
    .option("--rule <id...>", "only apply fixes from these rules")
    .option("--format <format>", "text or json", "text")
    .option("--model <id>", "model used for token counts")
    .action(async (target: string | undefined, opts: OptimizeOpts, cmd: Command) => {
      if (!["text", "json"].includes(opts.format))
        throw new UsageError(`Unsupported --format for optimize: ${opts.format}`);
      if (opts.mode !== "deterministic" && opts.mode !== "ai")
        throw new UsageError(`Unsupported --mode: ${opts.mode}`);
      const ctx = createContext(cmd, target);
      if (opts.mode === "ai") return runAiMode(ctx, opts);
      const counter = createCounter(ctx, opts.model);
      const discovered = await discoverFor(ctx);
      const result = await optimizeFiles(discovered.files, {
        config: ctx.loaded.config,
        counter,
        targetRepoPath: toRepoPath(ctx.root, ctx.target),
        ...(opts.rule ? { only: opts.rule } : {}),
      });
      const changed = result.files.filter((f) => f.status === "changed");
      const rejected = result.files.filter((f) => f.status === "rejected");
      const before = changed.reduce((s, f) => s + f.tokensBefore.inputTokens, 0);
      const after = changed.reduce((s, f) => s + f.tokensAfter.inputTokens, 0);
      const method = changed[0]?.tokensBefore.method ?? (await counter.count("")).method;

      let backupId: string | null = null;
      if (opts.apply && changed.length) {
        const byPath = new Map(discovered.files.map((f) => [f.path, f]));
        const writes: PlannedWrite[] = changed.map((f) => {
          const src = byPath.get(f.path);
          if (!src) throw new Error(`internal: missing ${f.path}`);
          return {
            path: f.path,
            before: encode(src.file),
            after: encode({ ...src.file, text: f.after }),
            mode: src.file.mode,
          };
        });
        if (opts.format !== "json") for (const f of changed) ctx.out.out(f.diff);
        backupId = (
          await applyWithBackup(ctx.root, writes, `optimize ${process.argv.slice(3).join(" ")}`.trim())
        ).id;
      }

      if (opts.format === "json") {
        printJson({
          schemaVersion: 1,
          mode: "deterministic",
          applied: Boolean(opts.apply && changed.length),
          backupId,
          tokens: {
            before,
            after,
            saved: before - after,
            method,
            basis: opts.apply ? "measured" : "estimated",
          },
          quality: "not verified",
          files: result.files.map((f) => ({
            path: f.path,
            status: f.status,
            rules: f.appliedRules,
            findingIds: f.findingIds,
            tokensBefore: f.tokensBefore.inputTokens,
            tokensAfter: f.tokensAfter.inputTokens,
            method: f.tokensBefore.method,
            diff: f.diff,
            ...(f.rejectionReason ? { rejectionReason: f.rejectionReason, violations: f.violations } : {}),
          })),
          recommendations: result.recommendations.map(({ edits: _e, ...r }) => r),
        });
        return;
      }
      if (!opts.apply) for (const f of changed) ctx.out.out(f.diff);
      if (changed.length) {
        ctx.out.out(
          renderTable(
            [
              { header: "File" },
              { header: "Before", align: "right" },
              { header: "After", align: "right" },
              { header: "Saved", align: "right" },
              { header: "Rules" },
            ],
            changed.map((f) => [
              f.path,
              formatInt(f.tokensBefore.inputTokens),
              formatInt(f.tokensAfter.inputTokens),
              formatInt(f.tokensBefore.inputTokens - f.tokensAfter.inputTokens),
              f.appliedRules.join(", "),
            ]),
          ),
        );
        const pct = before ? (((before - after) / before) * 100).toFixed(1) : "0.0";
        const basis = opts.apply ? "measured" : "estimated (dry run)";
        ctx.out.out(
          `\nTokens in changed files: ${formatInt(before)} → ${formatInt(after)} (−${pct}%), ${method} count, savings ${basis}.`,
        );
        ctx.out.out("Quality: not verified");
      } else {
        ctx.out.out("No deterministic fixes to apply.");
      }
      for (const f of rejected) {
        ctx.out.warn(`rejected ${f.path}: ${f.rejectionReason}`);
        for (const v of f.violations.slice(0, 5))
          ctx.out.warn(`  ${v.kind}: "${v.text}" (${v.before} → ${v.after})`);
      }
      if (result.recommendations.length) {
        ctx.out.out(
          `\n${result.recommendations.length} recommendation(s) need human judgment and are not applied:`,
        );
        for (const r of result.recommendations.slice(0, 10))
          ctx.out.out(`  ${r.ruleId}  ${location(r)}  ${r.description}`);
        if (result.recommendations.length > 10) ctx.out.out("  … run tokenwise audit for the full list");
      }
      if (opts.apply && backupId)
        ctx.out.out(`\nApplied. Backup: ${backupId} (undo with: tokenwise restore ${backupId})`);
      else if (changed.length)
        ctx.out.out("\nDry run: nothing was written. Re-run with --apply to write these changes.");
    });
}

async function runAiMode(ctx: CommandContext, opts: OptimizeOpts): Promise<void> {
  const model = opts.model ?? ctx.loaded.config.defaultModel;
  if (!model) throw new UsageError("--mode ai needs a model: pass --model or set defaultModel.");
  const discovered = await discoverFor(ctx);
  const files = discovered.files.filter((f) => !/\.(json|ya?ml)$/i.test(f.path));
  if (!files.length) return ctx.out.out("No prose instruction files to rewrite.");
  const provider = providerFor(model, ctx.loaded.config.providers, ctx.root);
  await requireEgressConsent(ctx.loaded.config, opts, {
    purpose: "AI-assisted optimization",
    destination: provider.destination,
    files: files.map((f) => ({ path: f.path, tokens: estimateTokens(f.file.text) })),
  });
  const counter = createCounter(ctx, opts.model);
  const proposals = await proposeAiRewrites(files, { provider, model, counter });
  const proposed = proposals.filter((p) => p.status === "proposed");
  if (opts.format === "json" && !opts.apply) {
    printJson({
      schemaVersion: 1,
      mode: "ai",
      label: AI_LABEL,
      applied: false,
      quality: "not verified",
      proposals: proposals.map(({ before: _b, after: _a, ...p }) => p),
    });
    return;
  }
  const text = opts.format !== "json";
  if (text) for (const p of proposed) ctx.out.out(`# ${AI_LABEL}\n${p.diff}`);
  for (const p of proposals.filter((x) => x.status === "rejected")) {
    ctx.out.warn(`rejected ${p.path}: ${p.reason}`);
    for (const v of p.violations.slice(0, 5)) ctx.out.warn(`  ${v.kind}: "${v.text}"`);
  }
  if (!proposed.length) {
    if (!text)
      printJson({
        schemaVersion: 1,
        mode: "ai",
        label: AI_LABEL,
        applied: false,
        quality: "not verified",
        proposals: [],
      });
    else ctx.out.out("No AI proposal passed the protected-content check with fewer tokens.");
    return;
  }
  const before = proposed.reduce((n, p) => n + p.tokensBefore, 0);
  const after = proposed.reduce((n, p) => n + p.tokensAfter, 0);
  if (text)
    ctx.out.out(
      `\n${AI_LABEL}: ${formatInt(before)} → ${formatInt(after)} tokens in ${proposed.length} file(s). Quality: not verified`,
    );
  if (!opts.apply)
    return ctx.out.out("Dry run: nothing was written. Re-run with --apply to review and apply.");
  if (!(await confirm(`Apply ${proposed.length} AI-proposed change(s)?`, opts)))
    throw new AbortedError("AI-proposed changes not applied.");
  const byPath = new Map(files.map((f) => [f.path, f]));
  const writes: PlannedWrite[] = proposed.map((p) => {
    const src = byPath.get(p.path);
    if (!src) throw new Error(`internal: missing ${p.path}`);
    return {
      path: p.path,
      before: encode(src.file),
      after: encode({ ...src.file, text: p.after }),
      mode: src.file.mode,
    };
  });
  const m = await applyWithBackup(ctx.root, writes, "optimize --mode ai");
  if (opts.format === "json") {
    printJson({
      schemaVersion: 1,
      mode: "ai",
      label: AI_LABEL,
      applied: true,
      backupId: m.id,
      quality: "not verified",
      proposals: proposals.map(({ before: _b, after: _a, ...p }) => p),
    });
    return;
  }
  ctx.out.out(`Applied. Backup: ${m.id} (undo with: tokenwise restore ${m.id})`);
}
