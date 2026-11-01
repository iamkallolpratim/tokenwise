import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { redact, UsageError } from "@tokenwise/shared";
import { estimateTokens } from "@tokenwise/tokenizers";
import YAML from "yaml";
import { z } from "zod";
import { formatZodIssues } from "./config.ts";
import { parseJsonOutput, validateJsonSchema } from "./jsonschema.ts";
import type { ModelProvider } from "./providers.ts";

const CriterionSchema = z.union([
  z.strictObject({ contains: z.string() }),
  z.strictObject({ not_contains: z.string() }),
  z.strictObject({ regex: z.string() }),
  z.strictObject({ json_schema: z.record(z.string(), z.unknown()) }),
  z.strictObject({ script: z.string() }),
]);
export type Criterion = z.infer<typeof CriterionSchema>;

export const EvalSuiteSchema = z.strictObject({
  name: z.string().min(1),
  /** Repo-relative file whose current content is the system prompt under test. */
  system: z.string().min(1),
  model: z.string().optional(),
  maxOutputTokens: z.number().int().positive().default(512),
  cases: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        input: z.string(),
        criteria: z.array(CriterionSchema).min(1),
      }),
    )
    .min(1),
});
export type EvalSuite = z.infer<typeof EvalSuiteSchema> & { file: string };

export async function loadEvalSuites(dir: string): Promise<EvalSuite[]> {
  if (!existsSync(dir)) throw new UsageError(`Eval directory not found: ${dir}`);
  const files = (await fs.readdir(dir)).filter((f) => /\.ya?ml$/.test(f)).sort();
  if (!files.length) throw new UsageError(`No *.yaml eval suites in ${dir}`);
  const out: EvalSuite[] = [];
  for (const f of files) {
    const file = path.join(dir, f);
    let raw: unknown;
    try {
      raw = YAML.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      throw new UsageError(`Invalid YAML in ${f}`, [(e as Error).message]);
    }
    const r = EvalSuiteSchema.safeParse(raw);
    if (!r.success) throw new UsageError(`Invalid eval suite ${f}`, formatZodIssues(r.error, f));
    out.push({ ...r.data, file });
  }
  return out;
}

export interface CriterionResult {
  criterion: string;
  pass: boolean;
  detail?: string;
}

export function checkCriterion(c: Criterion, output: string, suiteDir: string): CriterionResult {
  if ("contains" in c)
    return { criterion: `contains ${JSON.stringify(c.contains)}`, pass: output.includes(c.contains) };
  if ("not_contains" in c)
    return {
      criterion: `not_contains ${JSON.stringify(c.not_contains)}`,
      pass: !output.includes(c.not_contains),
    };
  if ("regex" in c) return { criterion: `regex /${c.regex}/`, pass: new RegExp(c.regex, "m").test(output) };
  if ("json_schema" in c) {
    try {
      const errors = validateJsonSchema(parseJsonOutput(output), c.json_schema);
      return {
        criterion: "json_schema",
        pass: errors.length === 0,
        ...(errors.length ? { detail: errors.slice(0, 3).join("; ") } : {}),
      };
    } catch (e) {
      return { criterion: "json_schema", pass: false, detail: `not JSON: ${(e as Error).message}` };
    }
  }
  const script = path.resolve(suiteDir, c.script);
  const r = spawnSync(process.execPath, [script], { input: output, encoding: "utf8", timeout: 30_000 });
  return {
    criterion: `script ${c.script}`,
    pass: r.status === 0,
    ...(r.status !== 0 ? { detail: redact((r.stderr || r.stdout || "").trim()).slice(0, 200) } : {}),
  };
}

export interface CaseResult {
  suite: string;
  id: string;
  pass: boolean;
  criteria: CriterionResult[];
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface EvalRun {
  model: string;
  provider: string;
  ranAt: string;
  cases: CaseResult[];
  passed: number;
  total: number;
  /** Sum of provider-reported output tokens; null if any case lacked usage. */
  outputTokens: number | null;
  inputTokens: number | null;
}

export async function runEvals(opts: {
  suites: EvalSuite[];
  root: string;
  model: string;
  provider: ModelProvider;
  now?: () => string;
}): Promise<EvalRun> {
  const cases: CaseResult[] = [];
  for (const suite of opts.suites) {
    const system = redact(await fs.readFile(path.join(opts.root, ...suite.system.split("/")), "utf8"));
    for (const c of suite.cases) {
      const res = await opts.provider.generate({
        model: opts.model,
        system,
        input: redact(c.input),
        maxOutputTokens: suite.maxOutputTokens,
      });
      const criteria = c.criteria.map((cr) => checkCriterion(cr, res.text, path.dirname(suite.file)));
      cases.push({
        suite: suite.name,
        id: c.id,
        pass: criteria.every((x) => x.pass),
        criteria,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      });
    }
  }
  const sum = (k: "inputTokens" | "outputTokens") =>
    cases.every((c) => c[k] !== null) ? cases.reduce((s, c) => s + (c[k] ?? 0), 0) : null;
  return {
    model: opts.model,
    provider: opts.provider.name,
    ranAt: opts.now?.() ?? new Date().toISOString(),
    cases,
    passed: cases.filter((c) => c.pass).length,
    total: cases.length,
    outputTokens: sum("outputTokens"),
    inputTokens: sum("inputTokens"),
  };
}

/** Approximate tokens per suite for the I1 consent listing (system file + case inputs). */
export async function estimateTokensFor(
  root: string,
  suites: EvalSuite[],
): Promise<{ path: string; tokens: number }[]> {
  const out: { path: string; tokens: number }[] = [];
  for (const s of suites) {
    const system = await fs.readFile(path.join(root, ...s.system.split("/")), "utf8").catch(() => "");
    const perCase = estimateTokens(system);
    out.push({
      path: `${s.system} (system prompt × ${s.cases.length} cases)`,
      tokens: perCase * s.cases.length,
    });
    out.push({
      path: `${path.basename(s.file)} (case inputs)`,
      tokens: s.cases.reduce((n, c) => n + estimateTokens(c.input), 0),
    });
  }
  return out;
}
