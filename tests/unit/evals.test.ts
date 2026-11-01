import {
  type Baseline,
  checkCriterion,
  compare,
  type EvalRun,
  parseJsonOutput,
  validateJsonSchema,
} from "@tokenwise/core";
import { DEFAULT_CONFIG } from "@tokenwise/shared";
import { describe, expect, it } from "vitest";

describe("eval criteria", () => {
  it.each([
    [{ contains: "human" }, "a human agent", true],
    [{ contains: "human" }, "a bot", false],
    [{ not_contains: "approved" }, "pending", true],
    [{ regex: "^\\{" }, '{"a":1}', true],
    [
      { json_schema: { type: "object", required: ["answer"], properties: { answer: { type: "string" } } } },
      '```json\n{"answer":"x"}\n```',
      true,
    ],
    [{ json_schema: { type: "object", required: ["answer"] } }, '{"other":1}', false],
    [{ json_schema: { type: "object" } }, "not json", false],
  ])("%j on %j → %s", (c, out, pass) => {
    expect(checkCriterion(c, out, ".").pass).toBe(pass);
  });

  it("reports unsupported JSON Schema keywords instead of ignoring them", () => {
    expect(validateJsonSchema({}, { type: "object", oneOf: [] })).toEqual([
      '$: unsupported schema keyword "oneOf"',
    ]);
  });

  it("parses fenced JSON", () => {
    expect(parseJsonOutput("```json\n[1]\n```")).toEqual([1]);
  });
});

const run = (passed: number, out: number): EvalRun => ({
  model: "m",
  provider: "custom",
  ranAt: "t",
  cases: [],
  passed,
  total: 2,
  outputTokens: out,
  inputTokens: 10,
});
const baseline = (ev?: EvalRun): Baseline => ({
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  model: "gpt-5",
  method: "exact",
  files: [{ path: "CLAUDE.md", sha256: "x", tokens: 100, method: "exact" }],
  totals: { tokens: 100 },
  findingIds: ["A", "B"],
  ...(ev ? { eval: ev } : {}),
});
const snap = (ev?: EvalRun) => ({
  model: "gpt-5",
  method: "exact" as const,
  files: [{ path: "CLAUDE.md", text: "y", tokens: 80, method: "exact" as const }],
  findingIds: ["B", "C"],
  ...(ev ? { eval: ev } : {}),
});

describe("benchmark comparison", () => {
  it("never reports success without an eval", () => {
    const c = compare(baseline(), snap(), DEFAULT_CONFIG);
    expect(c.quality).toEqual({ label: "not verified", status: "awaiting validation" });
    expect(c.input).toMatchObject({ before: 100, after: 80, change: -20, pctChange: -20 });
    expect(c.output).toMatchObject({ before: null, after: null, note: "no eval run" });
    expect(c.findings).toEqual({ resolved: 1, introduced: 1, baseline: 2 });
    expect(c.cost).toBeNull();
  });
  it("an eval on the current state only is still awaiting validation", () => {
    expect(compare(baseline(), snap(run(2, 50)), DEFAULT_CONFIG).quality.status).toBe("awaiting validation");
  });
  it("validated only when the eval pass count holds against the baseline eval", () => {
    expect(compare(baseline(run(2, 60)), snap(run(2, 50)), DEFAULT_CONFIG).quality.status).toBe("validated");
    expect(compare(baseline(run(2, 60)), snap(run(1, 50)), DEFAULT_CONFIG).quality.status).toBe("regressed");
  });
  it("estimates cost only with configured pricing", () => {
    const c = compare(baseline(), snap(), {
      ...DEFAULT_CONFIG,
      pricing: { "gpt-5": { inputPerMillion: 2 } },
    });
    expect(c.cost?.change).toBeCloseTo(-0.00004);
    expect(c.cost?.basis).toBe("estimated");
  });
  it("refuses to compare counts made with a different model or method", () => {
    const c = compare(baseline(), { ...snap(), model: null, method: "estimated" }, DEFAULT_CONFIG);
    expect(c.comparable).toBe(false);
    expect(c.method).toBe("mixed");
  });
});
