import { readdirSync } from "node:fs";
import path from "node:path";
import {
  ALL_RULES,
  buildFileContexts,
  discover,
  discoverCode,
  runAudit,
  TokenCounter,
} from "@tokenwise/core";
import { DEFAULT_CONFIG } from "@tokenwise/shared";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../helpers/cli.ts";

const FIXTURES = path.join(REPO_ROOT, "tests", "fixtures", "rules");

async function auditDir(dir: string, only?: string[]) {
  const config = { ...DEFAULT_CONFIG, thresholds: { ...DEFAULT_CONFIG.thresholds } };
  const { files } = await discover({ config, target: dir, root: dir });
  const codeFiles = await discoverCode({ config, target: dir, root: dir });
  return runAudit(buildFileContexts(files, "."), {
    config,
    codeFiles,
    counter: new TokenCounter("gpt-5"),
    ...(only ? { only } : {}),
  });
}

const ruleIds = readdirSync(FIXTURES).sort();

describe("rule fixtures", () => {
  it("every Phase 2 rule has positive and negative fixtures", () => {
    for (const id of [
      "RED-001",
      "RED-002",
      "RED-003",
      "RED-004",
      "RED-005",
      "FMT-001",
      "VERB-001",
      "VERB-002",
      "CTX-001",
      "CTX-002",
      "CTX-003",
      "SEC-001",
      "SEC-002",
    ]) {
      expect(ruleIds).toContain(id);
    }
  });

  describe.each(ruleIds)("%s", (id) => {
    it("fires on the positive fixture", async () => {
      const findings = await auditDir(path.join(FIXTURES, id, "positive"), [id]);
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) {
        expect(f.ruleId).toBe(id);
        expect(f.id).toMatch(new RegExp(`^${id}-[0-9a-f]{12}$`));
      }
    });

    it("stays silent on the negative fixture", async () => {
      expect(await auditDir(path.join(FIXTURES, id, "negative"), [id])).toEqual([]);
    });

    it("runs no other rule's false positives on its negative fixture at HIGH or above", async () => {
      const findings = await auditDir(path.join(FIXTURES, id, "negative"));
      expect(findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL")).toEqual([]);
    });
  });
});

describe("rule properties", () => {
  it("heuristic rules are never auto-fixable (I6)", () => {
    for (const r of ALL_RULES) {
      if (
        [
          "RED-003",
          "VERB-001",
          "VERB-002",
          "RED-004",
          "CTX-001",
          "CTX-002",
          "CTX-003",
          "SEC-001",
          "SEC-002",
        ].includes(r.id)
      ) {
        expect(r.fixable).toBe(false);
      }
    }
  });

  it("Phase 4 rules are recommendations unless config proves them, and say what would confirm them", async () => {
    const findings = await auditDir(path.join(REPO_ROOT, "examples", "sample-project"));
    for (const f of findings.filter((x) => /^(TOOL|RAG|LOOP|CACHE)-/.test(x.ruleId))) {
      expect(f.autoFixable).toBe(false);
      if (f.ruleId !== "TOOL-001" && f.ruleId !== "TOOL-002") expect(f.kind).toBe("recommendation");
      if (f.kind === "recommendation") expect(f.confirmWith).toBeTruthy();
    }
    for (const f of findings.filter((x) => /^LOOP-/.test(x.ruleId)))
      expect(f.confirmWith).toMatch(/cannot measure runtime/);
  });

  it("TOOL findings never recommend removing a required parameter", async () => {
    const dirs = ["TOOL-001", "TOOL-002", "TOOL-003", "TOOL-004"].map((id) =>
      path.join(FIXTURES, id, "positive"),
    );
    dirs.push(path.join(REPO_ROOT, "examples", "sample-project"));
    for (const d of dirs) {
      for (const f of (await auditDir(d)).filter((x) => x.ruleId.startsWith("TOOL-"))) {
        expect(f.recommendation).not.toMatch(/(?<!not )\bremove (?:the )?(?:required )?param/i);
        if (/required/.test(f.description) || /required/.test(f.recommendation)) {
          expect(f.recommendation).toMatch(/Do not remove required parameters|Keep every parameter/);
        }
      }
    }
  });

  it("finding ids are stable across runs", async () => {
    const a = await auditDir(path.join(REPO_ROOT, "examples", "sample-project"));
    const b = await auditDir(path.join(REPO_ROOT, "examples", "sample-project"));
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(new Set(a.map((f) => f.id)).size).toBe(a.length);
  });

  it("SEC-001 evidence never contains the secret", async () => {
    const findings = await auditDir(path.join(FIXTURES, "SEC-001", "positive"), ["SEC-001"]);
    expect(JSON.stringify(findings)).not.toContain("aB3dE5gH7jK9");
  });

  it("disabled rules in config do not run", async () => {
    const dir = path.join(FIXTURES, "RED-001", "positive");
    const config = { ...DEFAULT_CONFIG, rules: { disabled: ["RED-001"] } };
    const { files } = await discover({ config, target: dir, root: dir });
    const f = await runAudit(buildFileContexts(files, "."), { config, counter: new TokenCounter("gpt-5") });
    expect(f.filter((x) => x.ruleId === "RED-001")).toEqual([]);
  });
});
