import type { Finding } from "@tokenwise/shared";
import type { EvalRun } from "./evals.ts";
import type { FileContext } from "./rules/index.ts";
import type { UsageStats } from "./usage.ts";

export interface Dimension {
  key: "prompt" | "context" | "tool" | "output" | "agentLoop";
  name: string;
  weight: number;
  score: number | null;
  explanation: string;
}

export interface EfficiencyScore {
  score: number | null;
  /** Set when an open CRITICAL finding capped the score. */
  cappedBy: string | null;
  dimensions: Dimension[];
  renormalized: boolean;
  note: string;
}

const CRITICAL_CAP = 50;
/** Follow-up requests with at least this share of input read from cache score 100. */
export const CACHE_SHARE_TARGET = 0.8;
/** Below this many follow-up requests the usage sample is too small to score. */
export const MIN_FOLLOW_UPS = 3;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface ScoreInput {
  files: FileContext[];
  findings: Finding[];
  /** Token count per file path. */
  tokens: Map<string, number>;
  rootInstructionTokens: number;
  evalRun?: EvalRun;
  baselineEval?: EvalRun;
  /** Stats from imported usage logs (tokenwise ingest). */
  usage?: UsageStats;
}

/**
 * Token Efficiency Score (0–100) from observable evidence only. Formulas are documented in
 * the website (Concepts > Efficiency score). Waste is measured by findings, never by total size, so deleting
 * required content cannot raise the prompt dimension.
 */
export function computeScore(input: ScoreInput): EfficiencyScore {
  const byRule = (re: RegExp) => input.findings.filter((f) => re.test(f.ruleId));
  const savings = (fs: Finding[]) => fs.reduce((n, f) => n + (f.estimatedSavings?.tokens ?? 0), 0);
  const prose = input.files.filter((f) => f.isProse);
  const proseTokens = prose.reduce((n, f) => n + (input.tokens.get(f.file.path) ?? 0), 0);

  const dims: Dimension[] = [];

  // Prompt efficiency: redundancy/verbosity/format waste relative to prose tokens.
  if (proseTokens > 0) {
    const waste = savings(byRule(/^(RED|VERB|FMT)-/));
    const ratio = waste / proseTokens;
    dims.push({
      key: "prompt",
      name: "Prompt efficiency",
      weight: 20,
      score: clamp(100 * (1 - 3 * ratio)),
      explanation: `${waste} tokens of redundancy/verbosity findings in ${proseTokens} prose tokens (${(ratio * 100).toFixed(1)}%); score = 100 × (1 − 3 × ratio).`,
    });
  } else {
    dims.push({
      key: "prompt",
      name: "Prompt efficiency",
      weight: 20,
      score: null,
      explanation: "n/a: no prose instruction files analyzed.",
    });
  }

  // Context efficiency: always-loaded volume vs threshold, minus CTX findings.
  const always = input.files.filter((f) => f.alwaysLoaded && f.isRoot);
  const ctx = byRule(/^(CTX|CACHE)-/);
  if (always.length || ctx.length) {
    const vol = always.reduce((n, f) => n + (input.tokens.get(f.file.path) ?? 0), 0);
    const base = vol <= input.rootInstructionTokens ? 100 : (100 * input.rootInstructionTokens) / vol;
    const penalty = ctx.reduce(
      (n, f) =>
        n + (f.severity === "HIGH" || f.severity === "CRITICAL" ? 20 : f.severity === "MEDIUM" ? 10 : 3),
      0,
    );
    dims.push({
      key: "context",
      name: "Context efficiency",
      weight: 25,
      score: clamp(base - penalty),
      explanation: `${vol} always-loaded tokens vs threshold ${input.rootInstructionTokens} (base ${Math.round(base)}), minus ${penalty} for ${ctx.length} context finding(s).`,
    });
  } else {
    dims.push({
      key: "context",
      name: "Context efficiency",
      weight: 25,
      score: null,
      explanation: "n/a: no always-loaded instruction files or context findings.",
    });
  }

  // Tool efficiency: only when tool definitions exist.
  const toolFiles = input.files.filter((f) => f.file.category === "tool-schema");
  if (toolFiles.length) {
    const tf = byRule(/^TOOL-/);
    const penalty = tf.reduce(
      (n, f) => n + (f.severity === "HIGH" ? 25 : f.severity === "MEDIUM" ? 15 : 5),
      0,
    );
    dims.push({
      key: "tool",
      name: "Tool efficiency",
      weight: 20,
      score: clamp(100 - penalty),
      explanation: `${tf.length} tool finding(s) across ${toolFiles.length} tool file(s); 100 − ${penalty}.`,
    });
  } else {
    dims.push({
      key: "tool",
      name: "Tool efficiency",
      weight: 20,
      score: null,
      explanation: "n/a: no tool schema files analyzed.",
    });
  }

  // Output efficiency: requires an eval run.
  if (input.evalRun && input.evalRun.total > 0) {
    const pass = input.evalRun.passed / input.evalRun.total;
    const b = input.baselineEval?.outputTokens;
    const c = input.evalRun.outputTokens;
    const lengthFactor = b && c ? Math.min(1, b / c) : 1;
    dims.push({
      key: "output",
      name: "Output efficiency",
      weight: 15,
      score: clamp(100 * pass * lengthFactor),
      explanation: `${input.evalRun.passed}/${input.evalRun.total} eval cases passed${b && c ? `; output tokens ${c} vs baseline ${b}` : ""}.`,
    });
  } else {
    dims.push({
      key: "output",
      name: "Output efficiency",
      weight: 15,
      score: null,
      explanation: "n/a: requires an eval run (tokenwise benchmark --eval).",
    });
  }

  // Agent-loop efficiency: only from imported runtime usage. Static LOOP findings never score.
  const loops = byRule(/^LOOP-/).length;
  const loopNote = loops ? `; ${loops} static LOOP finding(s) lower confidence but are not scored` : "";
  const u = input.usage;
  if (u && u.followUpCacheShare !== null && u.followUps >= MIN_FOLLOW_UPS) {
    const share = u.followUpCacheShare;
    dims.push({
      key: "agentLoop",
      name: "Agent-loop efficiency",
      weight: 20,
      score: clamp((100 * share) / CACHE_SHARE_TARGET),
      explanation: `${(share * 100).toFixed(1)}% of input on ${u.followUps} follow-up request(s) across ${u.sessions} session(s) was read from cache (provider-reported usage); score = 100 × share / ${CACHE_SHARE_TARGET}${loopNote}.`,
    });
  } else {
    const why = !u
      ? "requires runtime usage data (tokenwise ingest <usage.jsonl>)"
      : `imported usage has ${u.followUps} follow-up request(s) in multi-request sessions; at least ${MIN_FOLLOW_UPS} are needed`;
    dims.push({
      key: "agentLoop",
      name: "Agent-loop efficiency",
      weight: 20,
      score: null,
      explanation: `n/a: ${why}${loopNote}.`,
    });
  }

  const scored = dims.filter((d) => d.score !== null);
  const weight = scored.reduce((n, d) => n + d.weight, 0);
  let score = weight ? Math.round(scored.reduce((n, d) => n + (d.score ?? 0) * d.weight, 0) / weight) : null;
  const critical = input.findings.filter((f) => f.severity === "CRITICAL");
  let cappedBy: string | null = null;
  if (score !== null && critical.length && score > CRITICAL_CAP) {
    score = CRITICAL_CAP;
    cappedBy = `${critical.length} open CRITICAL finding(s) (${[...new Set(critical.map((f) => f.ruleId))].join(", ")}) cap the score at ${CRITICAL_CAP}`;
  } else if (critical.length) {
    cappedBy = `${critical.length} open CRITICAL finding(s)`;
  }
  const renormalized = scored.length < dims.length;
  return {
    score,
    cappedBy,
    dimensions: dims,
    renormalized,
    note: renormalized
      ? `Weights renormalized over ${scored.length} of ${dims.length} dimensions with evidence (${weight}% of total weight).`
      : "All dimensions have evidence.",
  };
}
