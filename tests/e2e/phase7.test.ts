import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, run, SAMPLE, sampleCopy, tempDir } from "../helpers/cli.ts";

const FIX = path.join(REPO_ROOT, "tests", "fixtures", "usage");
const CLAUDE_LOG = path.join(FIX, "claude-code.jsonl");
const OPENAI_LOG = path.join(FIX, "openai.jsonl");

describe("ingest", () => {
  it("imports usage, stores no content, and gives the agent-loop dimension evidence", () => {
    const dir = sampleCopy();
    const before = JSON.parse(run(["audit", "--format", "json"], { cwd: dir }).stdout);
    expect(before.score.dimensions.find((d: { key: string }) => d.key === "agentLoop").score).toBeNull();

    const r = run(["ingest", CLAUDE_LOG, OPENAI_LOG, "--format", "json"], { cwd: dir });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.added).toBe(8);
    expect(out.written).toBe(".tokenwise/usage.json");
    expect(out.method).toBe("provider_api");
    const store = readFileSync(path.join(dir, ".tokenwise", "usage.json"), "utf8");
    expect(store).not.toMatch(/PRIVATE-|conv-a|req_1|s-1/);

    const after = JSON.parse(run(["audit", "--format", "json"], { cwd: dir }).stdout);
    const loop = after.score.dimensions.find((d: { key: string }) => d.key === "agentLoop");
    expect(loop.score).toBeGreaterThan(0);
    expect(after.score.note).toMatch(/4 of 5 dimensions/);

    const report = JSON.parse(run(["report", "--format", "json"], { cwd: dir }).stdout);
    expect(report.usage.requests).toBe(8);
    expect(run(["report", "--format", "markdown"], { cwd: dir }).stdout).toMatch(/## Runtime usage/);
  });

  it("re-import is a no-op; --replace starts over; --dry-run writes nothing", () => {
    const dir = sampleCopy();
    run(["ingest", CLAUDE_LOG], { cwd: dir });
    expect(JSON.parse(run(["ingest", CLAUDE_LOG, "--format", "json"], { cwd: dir }).stdout).added).toBe(0);
    const replaced = JSON.parse(
      run(["ingest", OPENAI_LOG, "--replace", "--format", "json"], { cwd: dir }).stdout,
    );
    expect(replaced.stats.requests).toBe(3);
    const fresh = sampleCopy();
    expect(run(["ingest", CLAUDE_LOG, "--dry-run"], { cwd: fresh }).stdout).toMatch(/Dry run/);
    expect(existsSync(path.join(fresh, ".tokenwise", "usage.json"))).toBe(false);
  });

  it("refuses secrets files and missing paths with a usage error", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, ".env"), "KEY=x\n");
    expect(run(["ingest", ".env"], { cwd: dir }).code).toBe(2);
    expect(run(["ingest", "missing.jsonl"], { cwd: dir }).code).toBe(2);
  });
});

describe("hooks", () => {
  const payload = (dir: string, file: string) =>
    JSON.stringify({
      hook_event_name: "PostToolUse",
      cwd: dir,
      tool_name: "Edit",
      tool_input: { file_path: path.join(dir, file) },
    });

  it("install is a dry run by default, applies with a backup, and restore removes a file it created", () => {
    const dir = sampleCopy();
    const settings = path.join(dir, ".claude", "settings.json");
    const dry = run(["hook", "install", "--target", "claude", "--scope", "project"], { cwd: dir });
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/Dry run/);
    expect(existsSync(settings)).toBe(false);
    const applied = JSON.parse(
      run(["hook", "install", "--target", "claude", "--scope", "project", "--apply", "--format", "json"], {
        cwd: dir,
      }).stdout,
    );
    expect(applied.applied).toBe(true);
    expect(JSON.parse(readFileSync(settings, "utf8")).hooks.PostToolUse[0].hooks[0].timeout).toBe(10);
    expect(run(["restore", applied.backupId], { cwd: dir }).code).toBe(0);
    expect(existsSync(settings)).toBe(false);
  });

  it("--remove leaves other settings untouched; user scope writes under the home directory", () => {
    const dir = sampleCopy();
    mkdirSync(path.join(dir, ".claude"), { recursive: true });
    const original = '{"model":"opus"}\n';
    writeFileSync(path.join(dir, ".claude", "settings.json"), original);
    run(["hook", "install", "--target", "claude", "--scope", "project", "--apply"], { cwd: dir });
    run(["hook", "install", "--target", "claude", "--scope", "project", "--apply", "--remove"], { cwd: dir });
    expect(JSON.parse(readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"))).toEqual({
      model: "opus",
    });

    const home = tempDir();
    const r = run(["hook", "install", "--target", "codex", "--scope", "user", "--apply"], {
      cwd: dir,
      env: { TOKENWISE_HOME: home },
    });
    expect(r.code).toBe(0);
    expect(existsSync(path.join(home, ".codex", "hooks.json"))).toBe(true);
    expect(r.stdout).toMatch(/--cwd /);
  });

  it("run reports findings for an edited instruction file as hook JSON and never writes", () => {
    const dir = sampleCopy();
    const before = readFileSync(path.join(dir, "CLAUDE.md"));
    const r = run(["hook", "run", "--target", "claude"], { cwd: dir, input: payload(dir, "CLAUDE.md") });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/RED-002/);
    expect(out.hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(800);
    expect(readFileSync(path.join(dir, "CLAUDE.md"))).toEqual(before);
    expect(existsSync(path.join(dir, ".tokenwise"))).toBe(false);
  });

  it("run is silent and exits 0 on bad input, non-instruction files, other events and timeouts", () => {
    const dir = sampleCopy();
    for (const input of [
      "",
      "not json",
      payload(dir, "src/agent.ts"),
      payload(dir, "../outside.md"),
      payload(dir, ".env"),
      JSON.stringify({ hook_event_name: "Stop", cwd: dir }),
    ]) {
      const r = run(["hook", "run", "--target", "claude"], { cwd: dir, input });
      expect(r.code, input).toBe(0);
      expect(r.stdout, input).toBe("");
    }
    const slow = run(["hook", "run", "--target", "claude", "--timeout-ms", "1"], {
      cwd: dir,
      input: payload(dir, "CLAUDE.md"),
    });
    expect(slow.code).toBe(0);
  });

  it("run understands Codex apply_patch payloads", () => {
    const dir = sampleCopy();
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      cwd: dir,
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Update File: AGENTS.md\n@@\n*** End Patch" },
    });
    const r = run(["hook", "run", "--target", "codex"], { cwd: dir, input });
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toMatch(/AGENTS\.md/);
  });

  it("the sample project itself is untouched by these tests", () => {
    expect(existsSync(path.join(SAMPLE, ".claude", "settings.json"))).toBe(false);
  });
});

describe("rule documentation links", () => {
  it("audit links each finding to its rule on the docs site when a docs URL is known", () => {
    const dir = sampleCopy();
    const env = { TOKENWISE_DOCS_URL: "https://docs.example.test/tokenwise" };
    const text = run(["audit", "--severity", "high"], { cwd: dir, env }).stdout;
    expect(text).toContain("docs:     https://docs.example.test/tokenwise/docs/reference/rules/#red-002");
    const json = JSON.parse(run(["audit", "--format", "json"], { cwd: dir, env }).stdout);
    for (const f of json.findings)
      expect(f.docsUrl).toBe(
        `https://docs.example.test/tokenwise/docs/reference/rules/#${f.ruleId.toLowerCase()}`,
      );
  });

  it("prints no link when no docs URL is configured", () => {
    const dir = sampleCopy();
    expect(run(["audit"], { cwd: dir }).stdout).not.toContain("docs:     ");
    const json = JSON.parse(run(["audit", "--format", "json"], { cwd: dir }).stdout);
    expect(json.findings[0].docsUrl).toBeUndefined();
  });
});
