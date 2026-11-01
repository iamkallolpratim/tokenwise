import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ReportSchema } from "@tokenwise/core";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, run, sampleCopy } from "../helpers/cli.ts";

const NOW = { TOKENWISE_NOW: "2026-10-30T09:12:00.000Z" };
const MOCK = path.join(REPO_ROOT, "tests", "helpers", "mock-provider.mjs");

function withEvals(dir: string, allowExternal: boolean) {
  writeFileSync(
    path.join(dir, "tokenwise.config.json"),
    JSON.stringify({
      version: 1,
      privacy: { telemetry: false, externalModelCalls: allowExternal },
      providers: { custom: { command: [process.execPath, MOCK] } },
    }),
  );
  mkdirSync(path.join(dir, ".tokenwise", "evals"), { recursive: true });
  writeFileSync(
    path.join(dir, ".tokenwise", "evals", "support.yaml"),
    [
      "name: support",
      "system: prompts/support-system.md",
      "model: custom:mock",
      "cases:",
      "  - id: big-refund",
      '    input: "I want a refund of $600 for order ord_1."',
      "    criteria:",
      '      - contains: "human agent"',
      "      - json_schema: { type: object, required: [answer, escalate], properties: { answer: { type: string }, escalate: { type: boolean } } }",
      "  - id: status",
      '    input: "Where is my order?"',
      "    criteria:",
      '      - not_contains: "refund"',
      "",
    ].join("\n"),
  );
}

describe("benchmark", () => {
  it("full workflow: save baseline → optimize → benchmark, honestly labeled", () => {
    const dir = sampleCopy();
    expect(run(["benchmark", "--save-baseline", "--model", "gpt-5"], { cwd: dir }).code).toBe(0);
    expect(run(["optimize", "--apply", "--model", "gpt-5", "--quiet"], { cwd: dir }).code).toBe(0);
    const r = run(["benchmark", "--model", "gpt-5"], { cwd: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Input tokens\s+[\d,]+\s+[\d,]+\s+-\d+\.\d%\s+exact \(gpt-5\)/);
    expect(r.stdout).toMatch(/Output tokens\s+n\/a\s+n\/a\s+n\/a\s+no eval run/);
    expect(r.stdout).toMatch(/Quality: not verified\s+Status: awaiting validation/);
    expect(r.stdout).not.toMatch(/success/i);
    const j = JSON.parse(run(["benchmark", "--model", "gpt-5", "--format", "json"], { cwd: dir }).stdout);
    expect(j.comparison.findings.introduced).toBe(0);
    expect(j.comparison.filesChanged).toBe(1);
  });

  it("missing baseline is a usage error", () => {
    expect(run(["benchmark"], { cwd: sampleCopy() }).code).toBe(2);
  });

  it("estimates cost only when pricing is configured", () => {
    const dir = sampleCopy();
    writeFileSync(
      path.join(dir, "tokenwise.config.json"),
      JSON.stringify({ version: 1, pricing: { "gpt-5": { inputPerMillion: 1.25 } } }),
    );
    run(["benchmark", "--save-baseline", "--model", "gpt-5"], { cwd: dir });
    expect(run(["benchmark", "--model", "gpt-5"], { cwd: dir }).stdout).toMatch(/Input cost \(USD\)/);
  });

  it("eval runs need I1 consent: config, flag, and --yes when not a TTY", () => {
    const dir = sampleCopy();
    withEvals(dir, false);
    const noConfig = run(["benchmark", "--save-baseline", "--eval", "--allow-external", "--yes"], {
      cwd: dir,
    });
    expect(noConfig.code).toBe(4);
    withEvals(dir, true);
    expect(run(["benchmark", "--save-baseline", "--eval", "--yes"], { cwd: dir }).code).toBe(4);
    const noYes = run(["benchmark", "--save-baseline", "--eval", "--allow-external"], { cwd: dir });
    expect(noYes.code).toBe(4);
    expect(noYes.stderr).toMatch(/prompts\/support-system\.md/);
  });

  it("with consent and a baseline eval, quality becomes validated", () => {
    const dir = sampleCopy();
    withEvals(dir, true);
    const save = run(["benchmark", "--save-baseline", "--eval", "--allow-external", "--yes"], { cwd: dir });
    expect(save.code).toBe(0);
    expect(save.stdout).toMatch(/eval 2\/2 passed/);
    run(["optimize", "--apply", "--quiet"], { cwd: dir });
    const r = run(["benchmark", "--eval", "--allow-external", "--yes"], { cwd: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Quality: preserved: 2\/2 passed \(baseline 2\/2\)\s+Status: validated/);
    expect(r.stdout).toMatch(/Output tokens\s+\d+\s+\d+\s+\S+\s+measured \(provider usage\)/);
  });
});

describe("report", () => {
  function reportDir() {
    const dir = sampleCopy();
    run(["benchmark", "--save-baseline"], { cwd: dir, env: NOW });
    run(["optimize", "--apply", "--quiet"], { cwd: dir, env: NOW });
    return dir;
  }

  it("JSON report validates against the versioned schema and labels everything", () => {
    const r = run(["report", "--format", "json"], { cwd: reportDir(), env: NOW });
    expect(r.code).toBe(0);
    const report = ReportSchema.parse(JSON.parse(r.stdout));
    expect(report.schemaVersion).toBe(1);
    expect(report.tokens.method).toBe("estimated");
    expect(report.quality).toBe("not verified");
    expect(report.savings.measured).toBeGreaterThan(0);
    expect(report.appliedChanges).toHaveLength(1);
    expect(report.score.dimensions.find((d) => d.key === "output")?.score).toBeNull();
    expect(r.stdout).not.toContain("Hq7Vw2LmRt9KpXz4");
  });

  it("matches golden snapshots (markdown, json, html)", async () => {
    const dir = reportDir();
    const scrub = (s: string) =>
      s.replace(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{6}/g, "<backup-id>");
    await expect(scrub(run(["report"], { cwd: dir, env: NOW }).stdout)).toMatchFileSnapshot(
      "__snapshots__/report.md",
    );
    const json = JSON.parse(run(["report", "--format", "json"], { cwd: dir, env: NOW }).stdout);
    json.appliedChanges = json.appliedChanges.map((a: { id: string; createdAt: string }) => ({
      ...a,
      id: "<backup-id>",
      createdAt: "<time>",
    }));
    await expect(`${JSON.stringify(json, null, 2)}\n`).toMatchFileSnapshot("__snapshots__/report.json");
    await expect(
      scrub(run(["report", "--format", "html"], { cwd: dir, env: NOW }).stdout),
    ).toMatchFileSnapshot("__snapshots__/report.html");
  });

  it("HTML is a single self-contained file", () => {
    const dir = reportDir();
    expect(run(["report", "--format", "html", "--out", "out/report.html"], { cwd: dir }).code).toBe(0);
    const html = readFileSync(path.join(dir, "out", "report.html"), "utf8");
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/<(script|link)\b[^>]*(src|href)=/i);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
    expect(html).toMatch(/b-measured/);
    expect(html).toMatch(/b-potential/);
  });
});
