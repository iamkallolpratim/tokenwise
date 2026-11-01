import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, run, sampleCopy, tempDir } from "../helpers/cli.ts";

const MOCK = path.join(REPO_ROOT, "tests", "helpers", "mock-provider.mjs");

function aiProject(external = true) {
  const dir = sampleCopy();
  writeFileSync(
    path.join(dir, "tokenwise.config.json"),
    JSON.stringify({
      version: 1,
      defaultModel: "custom:mock",
      privacy: { telemetry: false, externalModelCalls: external },
      providers: { custom: { command: [process.execPath, MOCK] } },
    }),
  );
  return dir;
}

describe("optimize --mode ai", () => {
  it("is refused without I1 consent", () => {
    const dir = aiProject(false);
    expect(run(["optimize", "--mode", "ai", "--allow-external", "--yes"], { cwd: dir }).code).toBe(4);
    expect(run(["optimize", "--mode", "ai", "--yes"], { cwd: aiProject(true) }).code).toBe(4);
    expect(run(["optimize", "--mode", "ai", "--allow-external"], { cwd: aiProject(true) }).code).toBe(4);
  });

  it("dry run shows labeled, I3-checked diffs and writes nothing; secrets are never sent", () => {
    const dir = aiProject();
    const log = path.join(tempDir(), "requests.log");
    const before = readFileSync(path.join(dir, "CLAUDE.md"));
    const r = run(["optimize", "--mode", "ai", "--allow-external", "--yes"], {
      cwd: dir,
      env: { MOCK_LOG: log },
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# AI-proposed, not guaranteed equivalent\n=+\n--- a\/CLAUDE\.md/);
    expect(r.stdout).toMatch(/-Hello Claude!/);
    expect(r.stdout).toMatch(/Quality: not verified/);
    expect(r.stderr).toMatch(
      /rejected prompts\/support-system\.md: file contains secret-like strings; not sent/,
    );
    expect(readFileSync(path.join(dir, "CLAUDE.md"))).toEqual(before);
    const sent = readFileSync(log, "utf8");
    expect(sent).not.toContain("Hq7Vw2LmRt9KpXz4");
    expect(sent).toContain("MUST-KEEP SPANS");
  });

  it("rejects proposals that drop protected content", () => {
    const dir = aiProject();
    const r = run(["optimize", "--mode", "ai", "--allow-external", "--yes", "--apply"], {
      cwd: dir,
      env: { MOCK_MODE: "bad" },
    });
    expect(r.stderr).toMatch(/rejected CLAUDE\.md: \d+ protected span\(s\) removed or altered/);
    expect(existsSync(path.join(dir, ".tokenwise", "backups"))).toBe(false);
  });

  it("--apply needs --yes when not a TTY, then writes with a backup", () => {
    const dir = aiProject();
    // --yes is consumed by the egress prompt too; without it nothing is sent or written.
    expect(run(["optimize", "--mode", "ai", "--allow-external", "--apply"], { cwd: dir }).code).toBe(4);
    const r = run(["optimize", "--mode", "ai", "--allow-external", "--apply", "--yes", "--format", "json"], {
      cwd: dir,
    });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.label).toBe("AI-proposed, not guaranteed equivalent");
    expect(out.applied).toBe(true);
    expect(readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).not.toMatch(/Hello Claude!/);
    expect(readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).toMatch(
      /You MUST NOT log customer email addresses/,
    );
    expect(run(["restore", out.backupId], { cwd: dir }).code).toBe(0);
    expect(readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).toMatch(/Hello Claude!/);
  });
});

describe("network guard (I1)", () => {
  // Every run() preloads tests/helpers/no-network.mjs, which kills the CLI with exit 99 on any socket,
  // DNS lookup or fetch. These cover each command, including flags that could trigger egress.
  const commands: string[][] = [
    ["init"],
    ["config", "show"],
    ["scan"],
    ["tokens", "--model", "claude-opus-5-5"],
    ["tokens", "--model", "claude-opus-5-5", "--allow-external", "--yes"],
    ["audit"],
    ["optimize"],
    ["optimize", "--apply"],
    ["optimize", "--mode", "ai", "--model", "claude-opus-5-5", "--allow-external", "--yes"],
    ["restore", "--list"],
    ["benchmark", "--save-baseline"],
    ["benchmark"],
    ["benchmark", "--eval", "--eval-model", "claude-opus-5-5", "--allow-external", "--yes"],
    ["report", "--format", "html"],
    ["install-skill", "--target", "claude", "--scope", "project"],
    ["ingest", path.join(REPO_ROOT, "tests", "fixtures", "usage", "claude-code.jsonl")],
    ["hook", "install", "--target", "claude", "--scope", "project", "--apply"],
    ["hook", "run", "--target", "claude"],
  ];
  it.each(commands.map((c) => [c.join(" "), c]))("tokenwise %s makes no network request", (_name, args) => {
    const dir = sampleCopy();
    const r = run(args as string[], { cwd: dir, env: { ANTHROPIC_API_KEY: "dummy-key-for-guard-test" } });
    expect(r.code).not.toBe(99);
  });
});

describe("hardening", () => {
  it("never writes API keys into config, logs or reports", () => {
    const dir = sampleCopy();
    run(["audit", "--verbose"], { cwd: dir });
    run(["report", "--out", "r.md"], { cwd: dir });
    const all = [path.join(dir, "r.md"), path.join(dir, ".tokenwise", "cache", "audit.json")]
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");
    expect(all).not.toContain("Hq7Vw2LmRt9KpXz4");
    expect(all).toContain("[REDACTED:");
  });

  it("unexpected errors exit 3 with a one-line message", () => {
    const dir = sampleCopy();
    const r = run(["restore", "2026-01-01T00-00-00-000Z-abcdef"], { cwd: dir });
    expect(r.code).toBe(2);
    expect(r.stderr.trim().split("\n")[0]).toMatch(/^error: No backup with id/);
  });

  it("leaves no stray files outside .tokenwise after a full run", () => {
    const dir = sampleCopy();
    const before = readdirSync(dir).sort();
    run(["audit"], { cwd: dir });
    run(["optimize", "--apply"], { cwd: dir });
    run(["benchmark", "--save-baseline"], { cwd: dir });
    expect(readdirSync(dir).sort()).toEqual([...new Set([...before, ".tokenwise"])].sort());
  });
});
