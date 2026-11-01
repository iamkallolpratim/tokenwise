import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, run, sampleCopy, tempDir } from "../helpers/cli.ts";

const json = (s: string) => JSON.parse(s);

describe("scan", () => {
  it("lists the sample project's AI files with labeled counts and nothing else", () => {
    const dir = sampleCopy();
    const r = run(["scan", "--format", "json"], { cwd: dir });
    expect(r.code).toBe(0);
    const out = json(r.stdout);
    const paths = out.files.map((f: { path: string }) => f.path);
    expect(paths).toEqual([
      ".claude/agents/reviewer.md",
      ".claude/agents/tester.md",
      ".claude/skills/deploy/SKILL.md",
      "AGENTS.md",
      "CLAUDE.md",
      "prompts/support-system.md",
      "rag/retrieval.yaml",
      "tools/tools.json",
    ]);
    for (const f of out.files) expect(["exact", "provider_api", "estimated"]).toContain(f.tokens.method);
    expect(out.files.find((f: { path: string }) => f.path === "CLAUDE.md").category).toBe(
      "agent-instructions",
    );
    expect(paths).not.toContain("README.md");
    expect(paths).not.toContain(".env");
  });

  it("uses exact counts with a known OpenAI model", () => {
    const r = run(["scan", "--model", "gpt-5", "--format", "json"], { cwd: sampleCopy() });
    expect(json(r.stdout).totals.method).toBe("exact");
  });

  it("text output warns about estimated counts on stderr only", () => {
    const r = run(["scan"], { cwd: sampleCopy() });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/CLAUDE\.md\s+agent-instructions/);
    expect(r.stderr).toMatch(/No model selected/);
    expect(r.stdout).not.toMatch(/warning/);
  });

  it("respects .gitignore and never reads secret files unless explicitly included", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, ".gitignore"), "ignored/\n");
    mkdirSync(path.join(dir, "ignored"));
    writeFileSync(path.join(dir, "ignored", "CLAUDE.md"), "# ignored");
    writeFileSync(path.join(dir, "CLAUDE.md"), "# root");
    writeFileSync(path.join(dir, "secrets.yaml"), "system: x\nmodel: y\n");
    const r = run(["scan", "--format", "json"], { cwd: dir });
    expect(json(r.stdout).files.map((f: { path: string }) => f.path)).toEqual(["CLAUDE.md"]);
    const explicit = run(["scan", "secrets.yaml", "--format", "json"], { cwd: dir });
    expect(json(explicit.stdout).files.map((f: { path: string }) => f.path)).toEqual(["secrets.yaml"]);
  });

  it("handles CRLF files, paths with spaces and Unicode filenames with forward-slash paths", () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, "my prompts", "ünïcødé"), { recursive: true });
    writeFileSync(
      path.join(dir, "my prompts", "ünïcødé", "SKILL.md"),
      "---\r\nname: x\r\ndescription: y\r\n---\r\n\r\nDo it.\r\n",
    );
    const r = run(["scan", "--format", "json"], { cwd: dir });
    expect(r.code).toBe(0);
    const f = json(r.stdout).files[0];
    expect(f.path).toBe("my prompts/ünïcødé/SKILL.md");
    expect(f.sections).toBe(0);
  });

  it("skips files larger than maxFileSizeBytes and binary files", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "CLAUDE.md"), "x".repeat(2000));
    writeFileSync(path.join(dir, "AGENTS.md"), Buffer.from([0x23, 0x00, 0x01, 0x02]));
    writeFileSync(
      path.join(dir, "tokenwise.config.json"),
      JSON.stringify({ version: 1, maxFileSizeBytes: 1000 }),
    );
    const out = json(run(["scan", "--format", "json"], { cwd: dir }).stdout);
    expect(out.files).toHaveLength(0);
    expect(out.skipped).toEqual(
      expect.arrayContaining([
        { path: "CLAUDE.md", reason: "too-large" },
        { path: "AGENTS.md", reason: "binary" },
      ]),
    );
  });
});

describe("tokens", () => {
  it("reports per-file method and a total", () => {
    const r = run(["tokens", "--model", "gpt-4o", "--format", "json"], { cwd: sampleCopy() });
    const out = json(r.stdout);
    expect(out.total.method).toBe("exact");
    expect(out.files.every((f: { encoding: string }) => f.encoding === "o200k_base")).toBe(true);
    expect(out.total.inputTokens).toBe(
      out.files.reduce((s: number, f: { inputTokens: number }) => s + f.inputTokens, 0),
    );
  });

  it("labels Claude counts as estimated without --allow-external", () => {
    const out = json(
      run(["tokens", "--model", "claude-opus-5-5", "--format", "json"], { cwd: sampleCopy() }).stdout,
    );
    expect(out.total.method).toBe("estimated");
    expect(out.warnings.join(" ")).toMatch(/offline tokenizer/);
  });

  it("refuses provider_api counting without config consent (exit 4) and makes no network call", () => {
    const r = run(["tokens", "--model", "claude-opus-5-5", "--allow-external", "--yes"], {
      cwd: sampleCopy(),
      env: { ANTHROPIC_API_KEY: "dummy" },
    });
    expect(r.code).toBe(4);
    expect(r.stderr).toMatch(/externalModelCalls/);
  });

  it("aborts in non-TTY without --yes even when config allows (exit 4)", () => {
    const dir = sampleCopy();
    writeFileSync(
      path.join(dir, "tokenwise.config.json"),
      JSON.stringify({ version: 1, privacy: { telemetry: false, externalModelCalls: true } }),
    );
    const r = run(["tokens", "--model", "claude-opus-5-5", "--allow-external"], {
      cwd: dir,
      env: { ANTHROPIC_API_KEY: "dummy" },
    });
    expect(r.code).toBe(4);
    expect(r.stderr).toMatch(/--yes/);
    expect(r.stderr).toMatch(/CLAUDE\.md/);
  });
});

describe("init and config", () => {
  it("creates config, updates .gitignore, never overwrites without --force", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/");
    writeFileSync(path.join(dir, "CLAUDE.md"), "# x");
    writeFileSync(path.join(dir, "AGENTS.md"), "# x");
    const r = run(["init"], { cwd: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Claude Code files: CLAUDE\.md/);
    expect(r.stdout).toMatch(/Codex files:\s+AGENTS\.md/);
    const cfg = json(readFileSync(path.join(dir, "tokenwise.config.json"), "utf8"));
    expect(cfg).toMatchObject({
      version: 1,
      defaultModel: null,
      privacy: { telemetry: false, externalModelCalls: false },
    });
    expect(readFileSync(path.join(dir, ".gitignore"), "utf8")).toBe(
      "node_modules/\n.tokenwise/backups/\n.tokenwise/usage.json\n",
    );
    expect(existsSync(path.join(dir, ".tokenwise"))).toBe(true);
    writeFileSync(path.join(dir, "tokenwise.config.json"), '{"version":1,"defaultModel":"gpt-5"}');
    run(["init"], { cwd: dir });
    expect(json(readFileSync(path.join(dir, "tokenwise.config.json"), "utf8")).defaultModel).toBe("gpt-5");
    run(["init", "--force"], { cwd: dir });
    expect(json(readFileSync(path.join(dir, "tokenwise.config.json"), "utf8")).defaultModel).toBeNull();
  });

  it("config set/get validates values and refuses API keys", () => {
    const dir = tempDir();
    run(["init"], { cwd: dir });
    expect(run(["config", "set", "defaultModel", "gpt-5"], { cwd: dir }).code).toBe(0);
    expect(json(run(["config", "get", "defaultModel"], { cwd: dir }).stdout)).toBe("gpt-5");
    const bad = run(["config", "set", "thresholds.nearDuplicateJaccard", "7"], { cwd: dir });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/nearDuplicateJaccard/);
    const key = run(["config", "set", "defaultModel", "sk-ant-api03-Zq8Lm2Wn5Vx9Tc3Hb7Mj1Kp4Rs6Yd0Fg"], {
      cwd: dir,
    });
    expect(key.code).toBe(2);
    expect(key.stderr).toMatch(/API key/);
    expect(key.stderr).not.toMatch(/Zq8Lm2/);
    expect(run(["config", "get", "nope.key"], { cwd: dir }).code).toBe(2);
  });
});

describe("exit codes and output purity", () => {
  it("unknown option → 2", () => {
    expect(run(["scan", "--bogus"], { cwd: tempDir() }).code).toBe(2);
  });
  it("invalid config → 2 with field-level message", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "tokenwise.config.json"), '{"version":2}');
    const r = run(["scan"], { cwd: dir });
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/version/);
  });
  it("missing path → 2", () => {
    expect(run(["scan", "does-not-exist"], { cwd: tempDir() }).code).toBe(2);
  });
  it("--help and --version → 0", () => {
    expect(run(["--help"], { cwd: tempDir() }).code).toBe(0);
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "apps", "cli", "package.json"), "utf8"));
    expect(run(["--version"], { cwd: tempDir() }).stdout.trim()).toBe(pkg.version);
  });
  it("--format json stdout parses as JSON even with warnings", () => {
    for (const cmd of [["scan"], ["tokens"], ["config", "show"]]) {
      const r = run([...cmd, ...(cmd[0] === "config" ? [] : ["--format", "json"])], { cwd: sampleCopy() });
      expect(() => JSON.parse(r.stdout)).not.toThrow();
    }
  });
});
