import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import {
  buildReport,
  compare,
  computeScore,
  defaultBaselinePath,
  EvalRunSchema,
  listBackups,
  loadBaseline,
  renderHtml,
  renderMarkdown,
} from "@tokenwise/core";
import { redact, toRepoPath, UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { analyze, loadUsageStats, now } from "../analyze.ts";
import { createContext, createCounter } from "../context.ts";
import { VERSION } from "../version.ts";

export function lastEvalPath(root: string): string {
  return path.join(root, ".tokenwise", "cache", "last-eval.json");
}

export async function readLastEval(root: string) {
  try {
    const r = EvalRunSchema.safeParse(JSON.parse(await fs.readFile(lastEvalPath(root), "utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function registerReport(program: Command): void {
  program
    .command("report [path]")
    .description("Write a JSON, Markdown or self-contained HTML report")
    .option("--format <format>", "json, markdown or html", "markdown")
    .option("--out <file>", "write to a file instead of stdout")
    .option("--baseline <file>", "baseline to compare against (default .tokenwise/baseline.json if present)")
    .option("--model <id>", "model used for token counts")
    .action(
      async (
        target: string | undefined,
        opts: { format: string; out?: string; baseline?: string; model?: string },
        cmd: Command,
      ) => {
        if (!["json", "markdown", "html"].includes(opts.format))
          throw new UsageError(`Unsupported --format for report: ${opts.format}`);
        const ctx = createContext(cmd, target);
        const counter = createCounter(ctx, opts.model);
        const a = await analyze(ctx, counter);
        const evaluation = await readLastEval(ctx.root);
        const baselineFile = opts.baseline
          ? path.resolve(ctx.cwd, opts.baseline)
          : defaultBaselinePath(ctx.root);
        const baseline = opts.baseline || existsSync(baselineFile) ? await loadBaseline(baselineFile) : null;
        const benchmark = baseline
          ? compare(
              baseline,
              {
                model: a.model,
                method: a.method,
                files: a.discovered.files.map((f) => ({
                  path: f.path,
                  text: f.file.text,
                  tokens: a.tokens.get(f.path) ?? 0,
                  method: a.method,
                })),
                findingIds: a.findings.map((f) => f.id),
                ...(evaluation && evaluation.ranAt >= baseline.createdAt ? { eval: evaluation } : {}),
              },
              ctx.loaded.config,
            )
          : null;
        const usage = await loadUsageStats(ctx.root);
        const score = computeScore({
          files: a.contexts,
          findings: a.findings,
          tokens: a.tokens,
          rootInstructionTokens: ctx.loaded.config.thresholds.rootInstructionTokens,
          ...(evaluation ? { evalRun: evaluation } : {}),
          ...(baseline?.eval ? { baselineEval: baseline.eval } : {}),
          ...(usage ? { usage } : {}),
        });
        const report = buildReport({
          generatedAt: now(),
          version: VERSION,
          target: toRepoPath(ctx.root, ctx.target),
          files: a.discovered.files.map((f) => ({
            path: f.path,
            category: f.category,
            tokens: a.tokens.get(f.path) ?? 0,
          })),
          codeFilesAnalyzed: a.codeFiles.length,
          skipped: a.discovered.skipped,
          method: a.method,
          model: a.model,
          findings: a.findings,
          score,
          backups: await listBackups(ctx.root),
          benchmark,
          evaluation,
          usage: usage ?? null,
        });
        const text =
          opts.format === "json"
            ? `${JSON.stringify(report, null, 2)}\n`
            : opts.format === "html"
              ? renderHtml(report)
              : renderMarkdown(report);
        const safe = redact(text);
        if (opts.out) {
          const file = path.resolve(ctx.cwd, opts.out);
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, safe);
          ctx.out.info(`wrote ${path.relative(ctx.cwd, file) || file}`);
        } else {
          process.stdout.write(safe);
        }
        for (const w of a.warnings) ctx.out.warn(w);
      },
    );
}
