import { buildFileContexts, computeScore, publicFinding, runAudit, writeAuditCache } from "@tokenwise/core";
import {
  docsSiteUrl,
  ruleDocsUrl,
  type Severity,
  SeveritySchema,
  severityAtLeast,
  toRepoPath,
  UsageError,
} from "@tokenwise/shared";
import type { Command } from "commander";
import { loadUsageStats } from "../analyze.ts";
import { createContext, createCounter } from "../context.ts";
import { discoverCodeFor, discoverFor } from "../discover.ts";
import { renderFindingsMarkdown, renderFindingsText, renderSummaryLine } from "../output/findings.ts";
import { printJson } from "../output/io.ts";

export function parseSeverity(v: string | undefined, flag: string): Severity | undefined {
  if (v === undefined) return undefined;
  const r = SeveritySchema.safeParse(v.toUpperCase());
  if (!r.success) throw new UsageError(`Invalid ${flag}: ${v} (expected critical, high, medium or low)`);
  return r.data;
}

interface AuditOpts {
  format: string;
  severity?: string;
  failOn?: string;
  rule?: string[];
  excludeRule?: string[];
  model?: string;
}

export function registerAudit(program: Command): void {
  program
    .command("audit [path]")
    .description("Run the rule engine and report findings grouped by severity")
    .option("--format <format>", "text, json or markdown", "text")
    .option("--severity <min>", "only show findings at or above this severity")
    .option("--fail-on <level>", "exit with code 1 if any finding is at or above this severity")
    .option("--rule <id...>", "only run these rules")
    .option("--exclude-rule <id...>", "skip these rules")
    .option("--model <id>", "model used for token counts")
    .action(async (target: string | undefined, opts: AuditOpts, cmd: Command) => {
      if (!["text", "json", "markdown"].includes(opts.format))
        throw new UsageError(`Unsupported --format for audit: ${opts.format}`);
      const minSeverity = parseSeverity(opts.severity, "--severity");
      const failOn = parseSeverity(opts.failOn, "--fail-on");
      const ctx = createContext(cmd, target);
      const counter = createCounter(ctx, opts.model);
      const discovered = await discoverFor(ctx);
      const contexts = buildFileContexts(discovered.files, toRepoPath(ctx.root, ctx.target));
      const codeFiles = await discoverCodeFor(ctx);
      const all = await runAudit(contexts, {
        config: ctx.loaded.config,
        codeFiles,
        counter,
        ...(opts.rule ? { only: opts.rule } : {}),
        ...(opts.excludeRule ? { exclude: opts.excludeRule } : {}),
      });
      const findings = all.map(publicFinding);
      await writeAuditCache(ctx.root, findings);
      const shown = minSeverity ? findings.filter((f) => severityAtLeast(f.severity, minSeverity)) : findings;
      const method = (await counter.count("")).method;
      const tokens = new Map<string, number>();
      for (const f of discovered.files) tokens.set(f.path, await counter.tokens(f.file.text));
      const usage = await loadUsageStats(ctx.root);
      const docsBase = docsSiteUrl();
      const score = computeScore({
        files: contexts,
        findings,
        tokens,
        rootInstructionTokens: ctx.loaded.config.thresholds.rootInstructionTokens,
        ...(usage ? { usage } : {}),
      });
      if (opts.format === "json") {
        printJson({
          schemaVersion: 1,
          tokenMethod: method,
          model: counter.model ?? null,
          filesAnalyzed: discovered.files.length,
          codeFilesAnalyzed: codeFiles.length,
          score,
          findings: docsBase ? shown.map((f) => ({ ...f, docsUrl: ruleDocsUrl(docsBase, f.ruleId) })) : shown,
        });
      } else if (opts.format === "markdown") {
        ctx.out.out(renderFindingsMarkdown(shown));
      } else {
        ctx.out.out(renderFindingsText(shown, ctx.out.colors, ctx.out.verbose, docsBase));
        ctx.out.out(`\n${renderSummaryLine(shown)}`);
        ctx.out.out(
          `Token Efficiency Score: ${score.score ?? "n/a"}${score.cappedBy ? ` (${score.cappedBy})` : ""}. ${score.note} Quality: not verified.`,
        );
        if (ctx.out.verbose)
          for (const d of score.dimensions)
            ctx.out.out(`  ${d.name} (${d.weight}%): ${d.score ?? "n/a"} — ${d.explanation}`);
        ctx.out.out(
          `Analyzed ${discovered.files.length} files and ${codeFiles.length} source file(s) with model calls; token counts are ${method}.`,
        );
      }
      if (failOn && findings.some((f) => severityAtLeast(f.severity, failOn))) process.exitCode = 1;
    });
}
