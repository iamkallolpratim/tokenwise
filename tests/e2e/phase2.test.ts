import { chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run, sampleCopy, tempDir } from "../helpers/cli.ts";

function snapshot(dir: string, files: string[]): Record<string, Buffer> {
  return Object.fromEntries(files.map((f) => [f, readFileSync(path.join(dir, f))]));
}
const SAMPLE_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  "prompts/support-system.md",
  "tools/tools.json",
  ".claude/agents/reviewer.md",
];

describe("audit", () => {
  it("finds the planted issues in the sample project", () => {
    const r = run(["audit", "--format", "json", "--model", "gpt-5"], { cwd: sampleCopy() });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    const rules = new Set(out.findings.map((f: { ruleId: string }) => f.ruleId));
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
      "TOOL-001",
      "TOOL-002",
      "TOOL-003",
      "RAG-001",
      "RAG-002",
      "RAG-003",
      "RAG-004",
      "LOOP-001",
      "LOOP-002",
      "CACHE-001",
    ]) {
      expect(rules, id).toContain(id);
    }
    expect(r.stdout).not.toContain("Hq7Vw2LmRt9KpXz4");
    for (const f of out.findings)
      if (f.estimatedSavings)
        expect(["measured", "estimated", "potential"]).toContain(f.estimatedSavings.basis);
    // The sample has 3 tools (below toolCount) and no unchanged-context loop: no false positives.
    expect(rules).not.toContain("TOOL-004");
    expect(rules).not.toContain("LOOP-003");
    expect(out.codeFilesAnalyzed).toBe(2);
  });

  it("--fail-on exits 1 when findings meet the threshold, 0 otherwise", () => {
    const dir = sampleCopy();
    expect(run(["audit", "--fail-on", "critical", "--quiet"], { cwd: dir }).code).toBe(1);
    expect(
      run(["audit", "--fail-on", "critical", "--exclude-rule", "SEC-001", "SEC-002", "--quiet"], { cwd: dir })
        .code,
    ).toBe(0);
  });

  it("--severity filters, unknown rules and bad severities are usage errors", () => {
    const dir = sampleCopy();
    const out = JSON.parse(run(["audit", "--severity", "high", "--format", "json"], { cwd: dir }).stdout);
    expect(out.findings.every((f: { severity: string }) => ["CRITICAL", "HIGH"].includes(f.severity))).toBe(
      true,
    );
    expect(run(["audit", "--rule", "NOPE-1"], { cwd: dir }).code).toBe(2);
    expect(run(["audit", "--severity", "urgent"], { cwd: dir }).code).toBe(2);
  });

  it("caches findings so scan can show counts", () => {
    const dir = sampleCopy();
    run(["audit", "--quiet"], { cwd: dir });
    const scan = JSON.parse(run(["scan", "--format", "json"], { cwd: dir }).stdout);
    const claude = scan.files.find((f: { path: string }) => f.path === "CLAUDE.md");
    expect(claude.findings.HIGH).toBeGreaterThan(0);
  });

  it("markdown format renders a table", () => {
    const r = run(["audit", "--format", "markdown"], { cwd: sampleCopy() });
    expect(r.stdout).toMatch(/^# TokenWise audit/m);
    expect(r.stdout).toMatch(/\| RED-002 \|/);
  });
});

describe("optimize", () => {
  it("dry run prints a diff and modifies nothing", () => {
    const dir = sampleCopy();
    const before = snapshot(dir, SAMPLE_FILES);
    const r = run(["optimize"], { cwd: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^--- a\/CLAUDE\.md$/m);
    expect(r.stdout).toMatch(/Dry run: nothing was written/);
    expect(r.stdout).toMatch(/Quality: not verified/);
    expect(snapshot(dir, SAMPLE_FILES)).toEqual(before);
  });

  it("--apply writes a backup; a second run is a no-op; restore round-trips byte-for-byte", () => {
    const dir = sampleCopy();
    const before = snapshot(dir, SAMPLE_FILES);
    const applied = run(["optimize", "--apply", "--format", "json"], { cwd: dir });
    expect(applied.code).toBe(0);
    const out = JSON.parse(applied.stdout);
    expect(out.applied).toBe(true);
    expect(out.tokens.basis).toBe("measured");
    expect(out.quality).toBe("not verified");
    expect(readFileSync(path.join(dir, "CLAUDE.md"))).not.toEqual(before["CLAUDE.md"]);
    const manifest = JSON.parse(
      readFileSync(path.join(dir, ".tokenwise", "backups", out.backupId, "manifest.json"), "utf8"),
    );
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual(["CLAUDE.md"]);

    const again = JSON.parse(run(["optimize", "--apply", "--format", "json"], { cwd: dir }).stdout);
    expect(again.applied).toBe(false);
    expect(again.files.every((f: { status: string }) => f.status === "unchanged")).toBe(true);

    const restored = run(["restore", out.backupId], { cwd: dir });
    expect(restored.code).toBe(0);
    expect(snapshot(dir, SAMPLE_FILES)).toEqual(before);
    const list = JSON.parse(run(["restore", "--list", "--format", "json"], { cwd: dir }).stdout);
    expect(list.backups).toHaveLength(2);
  });

  it("refuses to restore over later edits unless --force", () => {
    const dir = sampleCopy();
    const id = JSON.parse(run(["optimize", "--apply", "--format", "json"], { cwd: dir }).stdout).backupId;
    writeFileSync(path.join(dir, "CLAUDE.md"), "edited by hand\n");
    expect(run(["restore", id], { cwd: dir }).code).toBe(3);
    expect(run(["restore", id, "--force"], { cwd: dir }).code).toBe(0);
    expect(run(["restore", "nope"], { cwd: dir }).code).toBe(2);
  });

  it("preserves CRLF, BOM and file mode", () => {
    const dir = tempDir();
    const text = "# T\r\n\r\nUse the formatter before committing.   \r\n\r\n\r\n\r\nNever skip review.\r\n";
    const file = path.join(dir, "CLAUDE.md");
    writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]));
    chmodSync(file, 0o600);
    const r = run(["optimize", "--apply"], { cwd: dir });
    expect(r.code).toBe(0);
    const buf = readFileSync(file);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(buf.subarray(3).toString()).toBe(
      "# T\r\n\r\nUse the formatter before committing.\r\n\r\nNever skip review.\r\n",
    );
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("leaves no temp files behind", () => {
    const dir = sampleCopy();
    run(["optimize", "--apply", "--quiet"], { cwd: dir });
    expect(readdirSync(dir).filter((f) => f.includes(".tokenwise-"))).toEqual([]);
  });
});
