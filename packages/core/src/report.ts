import { type Finding, FindingSchema, redact, SEVERITY_ORDER, type Severity } from "@tokenwise/shared";
import { z } from "zod";
import type { BackupManifest } from "./backup.ts";
import { type Comparison, EvalRunSchema } from "./baseline.ts";
import type { EvalRun } from "./evals.ts";
import type { EfficiencyScore } from "./score.ts";
import type { UsageStats } from "./usage.ts";

export const REPORT_SCHEMA_VERSION = 1;

const DimensionSchema = z.object({
  key: z.string(),
  name: z.string(),
  weight: z.number(),
  score: z.number().nullable(),
  explanation: z.string(),
});

export const ReportSchema = z.object({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  generatedAt: z.string(),
  tool: z.object({ name: z.literal("tokenwise"), version: z.string() }),
  repository: z.object({
    target: z.string(),
    filesAnalyzed: z.number().int(),
    codeFilesAnalyzed: z.number().int(),
    categories: z.record(z.string(), z.number().int()),
    skipped: z.record(z.string(), z.number().int()),
  }),
  tokens: z.object({
    total: z.number().int(),
    method: z.enum(["exact", "provider_api", "estimated"]),
    model: z.string().nullable(),
    scope: z.literal("text"),
    methodology: z.string(),
    files: z.array(z.object({ path: z.string(), category: z.string(), tokens: z.number().int() })),
  }),
  score: z.object({
    score: z.number().nullable(),
    cappedBy: z.string().nullable(),
    dimensions: z.array(DimensionSchema),
    renormalized: z.boolean(),
    note: z.string(),
  }),
  findings: z.object({ counts: z.record(z.string(), z.number().int()), items: z.array(FindingSchema) }),
  savings: z.object({
    measured: z.number().int().nullable(),
    estimated: z.number().int(),
    potential: z.number().int(),
    note: z.string(),
  }),
  opportunities: z.array(
    z.object({
      id: z.string(),
      ruleId: z.string(),
      location: z.string(),
      tokens: z.number().int(),
      basis: z.string(),
      autoFixable: z.boolean(),
      description: z.string(),
    }),
  ),
  appliedChanges: z.array(
    z.object({ id: z.string(), createdAt: z.string(), command: z.string(), files: z.array(z.string()) }),
  ),
  risks: z.array(z.string()),
  benchmark: z.unknown().nullable(),
  evaluation: EvalRunSchema.nullable(),
  /** Provider-reported runtime usage imported with tokenwise ingest; null when none was imported. */
  usage: z
    .object({
      requests: z.number().int(),
      sessions: z.number().int(),
      followUps: z.number().int(),
      totalInput: z.number().int(),
      uncachedInput: z.number().int(),
      cacheRead: z.number().int(),
      cacheWrite: z.number().int(),
      output: z.number().int(),
      followUpCacheShare: z.number().nullable(),
      meanFollowUpInput: z.number().nullable(),
      models: z.array(z.string()),
      firstTimestamp: z.string().nullable(),
      lastTimestamp: z.string().nullable(),
    })
    .nullable(),
  quality: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

export interface ReportInput {
  generatedAt: string;
  version: string;
  target: string;
  files: { path: string; category: string; tokens: number }[];
  codeFilesAnalyzed: number;
  skipped: { reason: string }[];
  method: Report["tokens"]["method"];
  model: string | null;
  findings: Finding[];
  score: EfficiencyScore;
  backups: BackupManifest[];
  benchmark: Comparison | null;
  evaluation: EvalRun | null;
  usage?: UsageStats | null;
}

const loc = (f: Finding) => (f.range ? `${f.file}:${f.range.startLine}` : f.file);

export function buildReport(i: ReportInput): Report {
  const counts = Object.fromEntries(
    SEVERITY_ORDER.map((s) => [s, i.findings.filter((f) => f.severity === s).length]),
  );
  const categories: Record<string, number> = {};
  for (const f of i.files) categories[f.category] = (categories[f.category] ?? 0) + 1;
  const skipped: Record<string, number> = {};
  for (const s of i.skipped) skipped[s.reason] = (skipped[s.reason] ?? 0) + 1;
  const sum = (basis: string) =>
    i.findings
      .filter((f) => f.estimatedSavings?.basis === basis)
      .reduce((n, f) => n + (f.estimatedSavings?.tokens ?? 0), 0);
  const measured = i.benchmark?.comparable ? i.benchmark.input.before - i.benchmark.input.after : null;
  const methodology =
    i.method === "exact"
      ? `Counted locally with the ${i.model} tokenizer (text only; message framing, tools and system prompts added by a harness are not included).`
      : i.method === "provider_api"
        ? "Counted with the provider's token-counting API."
        : `Estimated with TokenWise's generic estimator${i.model ? ` (no offline tokenizer for ${i.model})` : " (no model selected)"}; see "Token counting" in the TokenWise docs for its error range.`;
  const report: Report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: i.generatedAt,
    tool: { name: "tokenwise", version: i.version },
    repository: {
      target: i.target,
      filesAnalyzed: i.files.length,
      codeFilesAnalyzed: i.codeFilesAnalyzed,
      categories,
      skipped,
    },
    tokens: {
      total: i.files.reduce((n, f) => n + f.tokens, 0),
      method: i.method,
      model: i.model,
      scope: "text",
      methodology,
      files: i.files,
    },
    score: i.score,
    findings: { counts, items: i.findings },
    savings: {
      measured,
      estimated: sum("estimated"),
      potential: sum("potential"),
      note: "Measured = before/after counts against a baseline. Estimated = size of text an auto-fix would remove. Potential = upper bound if a recommendation is followed; not additive across overlapping findings.",
    },
    opportunities: i.findings
      .filter((f) => f.estimatedSavings && f.estimatedSavings.tokens > 0)
      .sort((a, b) => (b.estimatedSavings?.tokens ?? 0) - (a.estimatedSavings?.tokens ?? 0))
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        ruleId: f.ruleId,
        location: loc(f),
        tokens: f.estimatedSavings?.tokens ?? 0,
        basis: f.estimatedSavings?.basis ?? "potential",
        autoFixable: f.autoFixable,
        description: f.description,
      })),
    appliedChanges: i.backups.map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      command: b.command,
      files: b.files.map((f) => f.path),
    })),
    risks: [
      ...i.findings
        .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
        .map((f) => `${f.severity} ${f.ruleId} at ${loc(f)}: ${f.description}`),
      ...(i.findings.some((f) => f.kind === "recommendation")
        ? [
            `${i.findings.filter((f) => f.kind === "recommendation").length} recommendation(s) are based on static analysis only and need runtime evidence.`,
          ]
        : []),
    ],
    benchmark: i.benchmark,
    evaluation: i.evaluation,
    usage: i.usage ?? null,
    quality:
      i.benchmark?.quality.label ??
      (i.evaluation
        ? `eval: ${i.evaluation.passed}/${i.evaluation.total} passed (no baseline comparison)`
        : "not verified"),
  };
  return ReportSchema.parse(report);
}

const esc = (s: string) =>
  redact(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mdEsc = (s: string) => redact(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "n/a" : n.toLocaleString("en-US");

function usageLine(u: NonNullable<Report["usage"]>): string {
  const share = u.followUpCacheShare === null ? "n/a" : `${(u.followUpCacheShare * 100).toFixed(1)}%`;
  return `${fmt(u.requests)} request(s) in ${fmt(u.sessions)} session(s) (provider-reported usage, ${u.firstTimestamp ?? "n/a"} to ${u.lastTimestamp ?? "n/a"}): input ${fmt(u.totalInput)} tokens (cache read ${fmt(u.cacheRead)}, cache write ${fmt(u.cacheWrite)}, uncached ${fmt(u.uncachedInput)}), output ${fmt(u.output)}. Cache share on follow-up requests: ${share}.`;
}

export function renderMarkdown(r: Report): string {
  const out: string[] = [];
  out.push(
    `# TokenWise report`,
    "",
    `Generated ${r.generatedAt} by tokenwise ${r.tool.version} for \`${r.repository.target}\`.`,
    "",
  );
  out.push("## Summary", "");
  out.push(
    `- Files analyzed: ${r.repository.filesAnalyzed} (+${r.repository.codeFilesAnalyzed} source files with model calls)`,
  );
  out.push(
    `- Tokens: ${fmt(r.tokens.total)} (**${r.tokens.method}**${r.tokens.model ? `, ${r.tokens.model}` : ""}). ${r.tokens.methodology}`,
  );
  out.push(
    `- Token Efficiency Score: **${r.score.score ?? "n/a"}**${r.score.cappedBy ? ` (${r.score.cappedBy})` : ""}`,
  );
  out.push(`- Quality: ${r.quality}`, "");
  out.push("## Score breakdown", "", "| Dimension | Weight | Score | Why |", "|---|---|---|---|");
  for (const d of r.score.dimensions)
    out.push(`| ${d.name} | ${d.weight}% | ${d.score ?? "n/a"} | ${mdEsc(d.explanation)} |`);
  out.push("", r.score.note, "");
  out.push("## Savings", "", "| Basis | Tokens |", "|---|---|");
  out.push(
    `| Measured | ${fmt(r.savings.measured)} |`,
    `| Estimated | ${fmt(r.savings.estimated)} |`,
    `| Potential | ${fmt(r.savings.potential)} |`,
    "",
    r.savings.note,
    "",
  );
  out.push("## Top opportunities", "");
  if (!r.opportunities.length) out.push("None.");
  else {
    out.push("| Rule | Location | Tokens | Basis | Auto-fix | Finding |", "|---|---|---|---|---|---|");
    for (const o of r.opportunities)
      out.push(
        `| ${o.ruleId} | \`${o.location}\` | ${fmt(o.tokens)} | ${o.basis} | ${o.autoFixable ? "yes" : "no"} | ${mdEsc(o.description)} |`,
      );
  }
  out.push("", "## Findings by severity", "");
  for (const sev of SEVERITY_ORDER) {
    const items = r.findings.items.filter((f) => f.severity === (sev as Severity));
    if (!items.length) continue;
    out.push(`### ${sev} (${items.length})`, "");
    for (const f of items)
      out.push(`- **${f.ruleId}** \`${loc(f)}\` — ${mdEsc(f.description)} _Risk:_ ${mdEsc(f.risk)}`);
    out.push("");
  }
  out.push("## Applied changes and backups", "");
  out.push(
    r.appliedChanges.length
      ? r.appliedChanges.map((b) => `- \`${b.id}\` ${mdEsc(b.command)}: ${b.files.join(", ")}`).join("\n")
      : "None.",
  );
  out.push(
    "",
    "## Remaining risks",
    "",
    r.risks.length ? r.risks.map((x) => `- ${mdEsc(x)}`).join("\n") : "None.",
    "",
  );
  out.push("## Benchmark", "");
  const b = r.benchmark as Comparison | null;
  if (b) {
    out.push(
      `Baseline ${b.baselineCreatedAt}: input tokens ${fmt(b.input.before)} → ${fmt(b.input.after)} (${b.input.pctChange === null ? "n/a" : `${b.input.pctChange.toFixed(1)}%`}, ${b.method}). Output tokens: ${fmt(b.output.before)} → ${fmt(b.output.after)} (${b.output.note}). Findings resolved ${b.findings.resolved}/${b.findings.baseline}. Status: ${b.quality.status}.`,
    );
  } else out.push("No baseline. Create one with `tokenwise benchmark --save-baseline`.");
  out.push("", "## Evaluation", "");
  out.push(
    r.evaluation
      ? `${r.evaluation.passed}/${r.evaluation.total} cases passed with ${r.evaluation.model} (${r.evaluation.ranAt}).`
      : "No evaluation run. Quality: not verified.",
  );
  if (r.usage) out.push("", "## Runtime usage", "", usageLine(r.usage));
  return `${out.join("\n")}\n`;
}

export function renderHtml(r: Report): string {
  const b = r.benchmark as Comparison | null;
  const badge = (basis: string) => `<span class="b b-${esc(basis)}">${esc(basis)}</span>`;
  const sevRows = r.findings.items
    .map(
      (f) =>
        `<tr><td><span class="s s-${f.severity}">${f.severity}</span></td><td>${esc(f.ruleId)}</td><td><code>${esc(loc(f))}</code></td><td>${esc(f.description)}<div class="m">Risk: ${esc(f.risk)}</div><div class="m">Fix: ${esc(f.recommendation)}</div></td><td>${f.estimatedSavings ? `${fmt(f.estimatedSavings.tokens)} ${badge(f.estimatedSavings.basis)}` : "n/a"}</td></tr>`,
    )
    .join("");
  const dims = r.score.dimensions
    .map(
      (d) =>
        `<tr><td>${esc(d.name)}</td><td>${d.weight}%</td><td>${d.score ?? "n/a"}</td><td>${esc(d.explanation)}</td></tr>`,
    )
    .join("");
  const opps = r.opportunities
    .map(
      (o) =>
        `<tr><td>${esc(o.ruleId)}</td><td><code>${esc(o.location)}</code></td><td>${fmt(o.tokens)}</td><td>${badge(o.basis)}</td><td>${o.autoFixable ? "yes" : "no"}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TokenWise report</title>
<style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#5b6470;--line:#d8dde3;--card:#f6f8fa;--meas:#1a7f37;--est:#9a6700;--pot:#6639ba;--crit:#a40e26;--high:#cf222e;--med:#9a6700;--low:#57606a}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#8d96a0;--line:#30363d;--card:#161b22;--meas:#3fb950;--est:#d29922;--pot:#a371f7;--crit:#ff7b72;--high:#f85149;--med:#d29922;--low:#8d96a0}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px}h2{margin-top:32px;border-bottom:1px solid var(--line);padding-bottom:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.card .v{font-size:26px;font-weight:600}.m,.mut{color:var(--mut);font-size:13px}table{width:100%;border-collapse:collapse;margin-top:8px;display:block;overflow-x:auto}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}code{font-size:13px;word-break:break-all}
.b{display:inline-block;border-radius:10px;padding:0 8px;font-size:12px;border:1px solid}.b-measured{color:var(--meas)}.b-estimated{color:var(--est)}.b-potential{color:var(--pot);border-style:dashed}
.s{font-weight:600;font-size:12px}.s-CRITICAL{color:var(--crit)}.s-HIGH{color:var(--high)}.s-MEDIUM{color:var(--med)}.s-LOW{color:var(--low)}
</style></head><body><main>
<h1>TokenWise report</h1>
<div class="mut">Generated ${esc(r.generatedAt)} · tokenwise ${esc(r.tool.version)} · <code>${esc(r.repository.target)}</code></div>
<div class="cards">
<div class="card"><div class="mut">Token Efficiency Score</div><div class="v">${r.score.score ?? "n/a"}</div><div class="m">${esc(r.score.cappedBy ?? r.score.note)}</div></div>
<div class="card"><div class="mut">Tokens (${esc(r.tokens.method)})</div><div class="v">${fmt(r.tokens.total)}</div><div class="m">${r.repository.filesAnalyzed} files</div></div>
<div class="card"><div class="mut">Savings ${badge("measured")}</div><div class="v">${fmt(r.savings.measured)}</div></div>
<div class="card"><div class="mut">Savings ${badge("estimated")}</div><div class="v">${fmt(r.savings.estimated)}</div></div>
<div class="card"><div class="mut">Savings ${badge("potential")}</div><div class="v">${fmt(r.savings.potential)}</div></div>
<div class="card"><div class="mut">Quality</div><div class="v" style="font-size:16px">${esc(r.quality)}</div></div>
</div>
<p class="m">${esc(r.tokens.methodology)} ${esc(r.savings.note)}</p>
<h2>Score breakdown</h2><table><tr><th>Dimension</th><th>Weight</th><th>Score</th><th>Why</th></tr>${dims}</table><p class="m">${esc(r.score.note)}</p>
<h2>Top opportunities</h2>${opps ? `<table><tr><th>Rule</th><th>Location</th><th>Tokens</th><th>Basis</th><th>Auto-fix</th></tr>${opps}</table>` : "<p>None.</p>"}
<h2>Findings (${r.findings.items.length})</h2>${sevRows ? `<table><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Finding</th><th>Savings</th></tr>${sevRows}</table>` : "<p>No findings.</p>"}
<h2>Applied changes and backups</h2>${r.appliedChanges.length ? `<ul>${r.appliedChanges.map((a) => `<li><code>${esc(a.id)}</code> ${esc(a.command)}: ${esc(a.files.join(", "))}</li>`).join("")}</ul>` : "<p>None.</p>"}
<h2>Remaining risks</h2>${r.risks.length ? `<ul>${r.risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>None.</p>"}
<h2>Benchmark</h2>${b ? `<p>Baseline ${esc(b.baselineCreatedAt)}: input tokens ${fmt(b.input.before)} → ${fmt(b.input.after)} (${b.input.pctChange === null ? "n/a" : `${b.input.pctChange.toFixed(1)}%`}, ${esc(String(b.method))}). Output tokens ${fmt(b.output.before)} → ${fmt(b.output.after)} (${esc(b.output.note)}). Findings resolved ${b.findings.resolved}/${b.findings.baseline}. Status: ${esc(b.quality.status)}.</p>` : "<p>No baseline.</p>"}
${r.usage ? `<h2>Runtime usage</h2><p>${esc(usageLine(r.usage))}</p>` : ""}<h2>Evaluation</h2><p>${r.evaluation ? `${r.evaluation.passed}/${r.evaluation.total} cases passed with ${esc(r.evaluation.model)}.` : "No evaluation run. Quality: not verified."}</p>
</main></body></html>
`;
}
