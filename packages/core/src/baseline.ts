import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import {
  sha256,
  type TokenMethod,
  TokenMethodSchema,
  type TokenwiseConfig,
  UsageError,
} from "@tokenwise/shared";
import { z } from "zod";
import type { EvalRun } from "./evals.ts";

const CaseResultSchema = z.object({
  suite: z.string(),
  id: z.string(),
  pass: z.boolean(),
  criteria: z.array(z.object({ criterion: z.string(), pass: z.boolean(), detail: z.string().optional() })),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
});
export const EvalRunSchema = z.object({
  model: z.string(),
  provider: z.string(),
  ranAt: z.string(),
  cases: z.array(CaseResultSchema),
  passed: z.number().int(),
  total: z.number().int(),
  outputTokens: z.number().nullable(),
  inputTokens: z.number().nullable(),
});

export const BaselineSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  model: z.string().nullable(),
  method: TokenMethodSchema,
  files: z.array(
    z.object({ path: z.string(), sha256: z.string(), tokens: z.number().int(), method: TokenMethodSchema }),
  ),
  totals: z.object({ tokens: z.number().int() }),
  findingIds: z.array(z.string()),
  eval: EvalRunSchema.optional(),
});
export type Baseline = z.infer<typeof BaselineSchema>;

export function defaultBaselinePath(root: string): string {
  return path.join(root, ".tokenwise", "baseline.json");
}

export interface Snapshot {
  model: string | null;
  method: TokenMethod;
  files: { path: string; text: string; tokens: number; method: TokenMethod }[];
  findingIds: string[];
  eval?: EvalRun;
}

export function toBaseline(s: Snapshot, createdAt: string): Baseline {
  return {
    version: 1,
    createdAt,
    model: s.model,
    method: s.method,
    files: s.files.map((f) => ({ path: f.path, sha256: sha256(f.text), tokens: f.tokens, method: f.method })),
    totals: { tokens: s.files.reduce((n, f) => n + f.tokens, 0) },
    findingIds: s.findingIds,
    ...(s.eval ? { eval: s.eval } : {}),
  };
}

export async function saveBaseline(file: string, b: Baseline): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(b, null, 2)}\n`);
}

export async function loadBaseline(file: string): Promise<Baseline> {
  if (!existsSync(file))
    throw new UsageError(`No baseline at ${file}. Create one with: tokenwise benchmark --save-baseline`);
  const r = BaselineSchema.safeParse(JSON.parse(await fs.readFile(file, "utf8")));
  if (!r.success) throw new UsageError(`Invalid baseline file ${file}`);
  return r.data;
}

export type QualityStatus = "awaiting validation" | "validated" | "regressed";

export interface Comparison {
  baselineCreatedAt: string;
  comparable: boolean;
  method: TokenMethod | "mixed";
  encodingNote: string | null;
  files: {
    path: string;
    before: number | null;
    after: number | null;
    status: "changed" | "unchanged" | "added" | "removed";
  }[];
  input: { before: number; after: number; change: number; pctChange: number | null };
  output: { before: number | null; after: number | null; basis: "measured" | null; note: string };
  filesChanged: number;
  findings: { resolved: number; introduced: number; baseline: number };
  cost: {
    before: number;
    after: number;
    change: number;
    currency: "USD";
    basis: "estimated";
    note: string;
  } | null;
  quality: { label: string; status: QualityStatus; passed?: number; total?: number };
}

export function compare(b: Baseline, s: Snapshot, config: TokenwiseConfig): Comparison {
  const cur = new Map(s.files.map((f) => [f.path, f]));
  const prev = new Map(b.files.map((f) => [f.path, f]));
  const files: Comparison["files"] = [];
  for (const p of [...new Set([...prev.keys(), ...cur.keys()])].sort()) {
    const a = prev.get(p);
    const c = cur.get(p);
    const status = !a ? "added" : !c ? "removed" : a.sha256 === sha256(c.text) ? "unchanged" : "changed";
    files.push({ path: p, before: a?.tokens ?? null, after: c?.tokens ?? null, status });
  }
  const before = b.totals.tokens;
  const after = s.files.reduce((n, f) => n + f.tokens, 0);
  const comparable = b.model === s.model && b.method === s.method;
  const prevIds = new Set(b.findingIds);
  const curIds = new Set(s.findingIds);

  const price = s.model ? config.pricing[s.model] : undefined;
  const cost =
    price && comparable
      ? {
          before: (before * price.inputPerMillion) / 1e6,
          after: (after * price.inputPerMillion) / 1e6,
          change: ((after - before) * price.inputPerMillion) / 1e6,
          currency: "USD" as const,
          basis: "estimated" as const,
          note: "Input cost of loading every analyzed file once, from configured pricing.",
        }
      : null;

  let quality: Comparison["quality"] = { label: "not verified", status: "awaiting validation" };
  if (s.eval && b.eval) {
    const same = s.eval.model === b.eval.model && s.eval.total === b.eval.total;
    const ok = same && s.eval.passed >= b.eval.passed;
    quality = {
      label: same
        ? `${ok ? "preserved" : "regressed"}: ${s.eval.passed}/${s.eval.total} passed (baseline ${b.eval.passed}/${b.eval.total})`
        : "not comparable: eval model or case count changed",
      status: ok ? "validated" : same ? "regressed" : "awaiting validation",
      passed: s.eval.passed,
      total: s.eval.total,
    };
  } else if (s.eval) {
    quality = {
      label: `eval ran on current state only: ${s.eval.passed}/${s.eval.total} passed; no baseline eval to compare`,
      status: "awaiting validation",
      passed: s.eval.passed,
      total: s.eval.total,
    };
  }

  const outBefore = b.eval?.outputTokens ?? null;
  const outAfter = s.eval?.outputTokens ?? null;
  return {
    baselineCreatedAt: b.createdAt,
    comparable,
    method: comparable ? s.method : "mixed",
    encodingNote: comparable
      ? null
      : `Baseline counted with ${b.model ?? "no model"} (${b.method}); now ${s.model ?? "no model"} (${s.method}). Token change is not comparable.`,
    files,
    input: {
      before,
      after,
      change: after - before,
      pctChange: before ? ((after - before) / before) * 100 : null,
    },
    output: {
      before: outBefore,
      after: outAfter,
      basis: outBefore !== null && outAfter !== null ? "measured" : null,
      note:
        outBefore !== null && outAfter !== null ? "provider-reported usage from eval runs" : "no eval run",
    },
    filesChanged: files.filter((f) => f.status !== "unchanged").length,
    findings: {
      resolved: [...prevIds].filter((i) => !curIds.has(i)).length,
      introduced: [...curIds].filter((i) => !prevIds.has(i)).length,
      baseline: prevIds.size,
    },
    cost,
    quality,
  };
}
