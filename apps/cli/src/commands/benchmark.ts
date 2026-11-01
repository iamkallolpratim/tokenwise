import { promises as fs } from "node:fs";
import path from "node:path";
import {
  compare,
  defaultBaselinePath,
  type EvalRun,
  estimateTokensFor,
  loadBaseline,
  loadEvalSuites,
  providerFor,
  runEvals,
  type Snapshot,
  saveBaseline,
  toBaseline,
} from "@tokenwise/core";
import { formatInt, UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { analyze, now } from "../analyze.ts";
import { requireEgressConsent } from "../consent.ts";
import { type CommandContext, createContext, createCounter } from "../context.ts";
import { printJson } from "../output/io.ts";
import { renderTable } from "../output/table.ts";
import { lastEvalPath } from "./report.ts";

interface BenchOpts {
  saveBaseline?: boolean;
  baseline?: string;
  eval?: string | boolean;
  model?: string;
  evalModel?: string;
  allowExternal?: boolean;
  yes?: boolean;
  format: string;
}

async function runEvalSuites(ctx: CommandContext, opts: BenchOpts): Promise<EvalRun> {
  const dir = path.resolve(ctx.cwd, typeof opts.eval === "string" ? opts.eval : ".tokenwise/evals");
  const suites = await loadEvalSuites(dir);
  const models = new Set(
    suites.map((s) => s.model ?? opts.evalModel ?? opts.model ?? ctx.loaded.config.defaultModel ?? ""),
  );
  if (models.has(""))
    throw new UsageError(
      "Eval runs need a model: set `model` in the suite, --eval-model, --model, or defaultModel.",
    );
  if (models.size > 1)
    throw new UsageError(
      `Eval suites use different models (${[...models].join(", ")}); run them separately.`,
    );
  const model = [...models][0] ?? "";
  const provider = providerFor(model, ctx.loaded.config.providers, ctx.root);
  await requireEgressConsent(ctx.loaded.config, opts, {
    purpose: `Running ${suites.reduce((n, s) => n + s.cases.length, 0)} eval case(s) with ${model}`,
    destination: provider.destination,
    files: await estimateTokensFor(ctx.root, suites),
  });
  return runEvals({ suites, root: ctx.root, model, provider, now });
}

export function registerBenchmark(program: Command): void {
  program
    .command("benchmark [path]")
    .description("Save a baseline, or compare the current state with one (optionally running an eval suite)")
    .option("--save-baseline", "write .tokenwise/baseline.json (or --baseline <file>)")
    .option("--baseline <file>", "baseline file to write or compare against")
    .option(
      "--eval [dir]",
      "run eval suites (default .tokenwise/evals); calls a model, see Privacy in the docs",
    )
    .option("--eval-model <id>", "model for eval runs when suites do not set one")
    .option("--model <id>", "model used for token counts")
    .option("--allow-external", "permit eval calls to a model provider")
    .option("--yes", "confirm external calls without a prompt (required when not a TTY)")
    .option("--format <format>", "text or json", "text")
    .action(async (target: string | undefined, opts: BenchOpts, cmd: Command) => {
      if (!["text", "json"].includes(opts.format))
        throw new UsageError(`Unsupported --format for benchmark: ${opts.format}`);
      const wantsEval = opts.eval !== undefined && opts.eval !== false;
      const ctx = createContext(cmd, target);
      const counter = createCounter(ctx, opts.model);
      const a = await analyze(ctx, counter);
      const evalRun = wantsEval ? await runEvalSuites(ctx, opts) : undefined;
      if (evalRun) {
        await fs.mkdir(path.dirname(lastEvalPath(ctx.root)), { recursive: true });
        await fs.writeFile(lastEvalPath(ctx.root), JSON.stringify(evalRun, null, 2));
      }
      const snapshot: Snapshot = {
        model: a.model,
        method: a.method,
        files: a.discovered.files.map((f) => ({
          path: f.path,
          text: f.file.text,
          tokens: a.tokens.get(f.path) ?? 0,
          method: a.method,
        })),
        findingIds: a.findings.map((f) => f.id),
        ...(evalRun ? { eval: evalRun } : {}),
      };
      const file = opts.baseline ? path.resolve(ctx.cwd, opts.baseline) : defaultBaselinePath(ctx.root);

      if (opts.saveBaseline) {
        const b = toBaseline(snapshot, now());
        await saveBaseline(file, b);
        if (opts.format === "json")
          return printJson({ saved: path.relative(ctx.cwd, file).split(path.sep).join("/"), baseline: b });
        ctx.out.out(
          `Baseline saved to ${path.relative(ctx.cwd, file) || file}: ${b.files.length} files, ${formatInt(b.totals.tokens)} tokens (${b.method}), ${b.findingIds.length} findings${evalRun ? `, eval ${evalRun.passed}/${evalRun.total} passed` : ""}.`,
        );
        for (const w of a.warnings) ctx.out.warn(w);
        return;
      }

      const baseline = await loadBaseline(file);
      const c = compare(baseline, snapshot, ctx.loaded.config);
      if (opts.format === "json")
        return printJson({ schemaVersion: 1, comparison: c, eval: evalRun ?? null });

      const pct =
        c.input.pctChange === null
          ? "n/a"
          : `${c.input.pctChange >= 0 ? "+" : ""}${c.input.pctChange.toFixed(1)}%`;
      const methodLabel =
        c.method === "mixed" ? "not comparable" : `${c.method}${a.model ? ` (${a.model})` : ""}`;
      const n = (v: number | null) => (v === null ? "n/a" : formatInt(v));
      const rows = [
        ["Input tokens", formatInt(c.input.before), formatInt(c.input.after), pct, methodLabel],
        [
          "Output tokens",
          n(c.output.before),
          n(c.output.after),
          c.output.before !== null && c.output.after !== null && c.output.before
            ? `${(((c.output.after - c.output.before) / c.output.before) * 100).toFixed(1)}%`
            : "n/a",
          c.output.basis ? "measured (provider usage)" : c.output.note,
        ],
        ["Files changed", "", String(c.filesChanged), "", ""],
        ["Findings resolved", "", `${c.findings.resolved} / ${c.findings.baseline}`, "", ""],
        ["Findings introduced", "", String(c.findings.introduced), "", ""],
      ];
      if (c.cost)
        rows.push([
          "Input cost (USD)",
          c.cost.before.toFixed(4),
          c.cost.after.toFixed(4),
          c.cost.change.toFixed(4),
          "estimated from configured pricing",
        ]);
      ctx.out.out(`TOKENWISE BENCHMARK            baseline: ${c.baselineCreatedAt}\n`);
      ctx.out.out(
        renderTable(
          [
            { header: "Metric" },
            { header: "Before", align: "right" },
            { header: "After", align: "right" },
            { header: "Change", align: "right" },
            { header: "Method" },
          ],
          rows,
        ),
      );
      ctx.out.out(`\nQuality: ${c.quality.label}    Status: ${c.quality.status}`);
      if (!c.cost)
        ctx.out.out("Cost: n/a (set pricing for this model in tokenwise.config.json to estimate it)");
      if (c.encodingNote) ctx.out.warn(c.encodingNote);
      for (const w of a.warnings) ctx.out.warn(w);
    });
}
