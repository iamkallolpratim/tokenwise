import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TARGETS, validateSkillFile } from "@tokenwise/integrations";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, run, tempDir } from "../helpers/cli.ts";

const SKILLS = path.join(REPO_ROOT, "skills");

describe("skill packaging", () => {
  it.each(["claude", "codex"] as const)(
    "%s SKILL.md frontmatter validates against the verified spec",
    (t) => {
      const spec = TARGETS[t];
      const text = readFileSync(path.join(SKILLS, spec.sourceDir, "SKILL.md"), "utf8");
      const { data, errors } = validateSkillFile(spec, text);
      expect(errors).toEqual([]);
      expect(data.name).toBe("tokenwise");
      expect(String(data.description)).toMatch(/token/i);
    },
  );

  it("validator rejects broken frontmatter", () => {
    expect(validateSkillFile(TARGETS.codex, "# no frontmatter").errors).not.toEqual([]);
    expect(validateSkillFile(TARGETS.codex, "---\ndescription: x\n---\n").errors).toContain(
      "missing required field: name",
    );
    expect(
      validateSkillFile(TARGETS.claude, `---\ndescription: ${"x".repeat(1600)}\n---\n`).errors.join(),
    ).toMatch(/limit 1536/);
  });

  it("generated references are in sync with skills/_shared/references", () => {
    const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "sync-skills.mjs"), "--check"], {
      encoding: "utf8",
    });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("skills delegate to the CLI rather than reimplementing rules", () => {
    for (const t of ["claude", "codex"] as const) {
      const text = readFileSync(path.join(SKILLS, TARGETS[t].sourceDir, "SKILL.md"), "utf8");
      expect(text).toMatch(/npx @klawde\/tokenwise audit \. --format json/);
      expect(text).toMatch(/Apply only after the user approves/);
      expect(text.split("\n").length).toBeLessThan(80);
    }
  });

  it("TokenWise's own skills and references pass its audit with no HIGH or CRITICAL findings", () => {
    const r = run(["audit", "skills", "--fail-on", "medium", "--format", "json"], { cwd: REPO_ROOT });
    expect(JSON.parse(r.stdout).findings).toEqual([]);
    expect(r.code).toBe(0);
  });
});

describe("install-skill", () => {
  it.each([
    ["claude", "project", ".claude/skills/tokenwise"],
    ["codex", "project", ".agents/skills/tokenwise"],
    ["claude", "user", ".claude/skills/tokenwise"],
    ["codex", "user", ".agents/skills/tokenwise"],
  ])("%s/%s installs into %s", (target, scope, rel) => {
    const project = tempDir();
    const home = tempDir("tokenwise-home-");
    const env = { HOME: home, TOKENWISE_HOME: home };
    const base = scope === "project" ? project : home;
    const dry = run(["install-skill", "--target", target, "--scope", scope], { cwd: project, env });
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/Dry run/);
    expect(existsSync(path.join(base, rel))).toBe(false);

    const r = run(["install-skill", "--target", target, "--scope", scope, "--apply"], { cwd: project, env });
    expect(r.code).toBe(0);
    for (const f of [
      "SKILL.md",
      "references/optimization-rules.md",
      "references/safety-guardrails.md",
      "references/prompt-engineering.md",
      "references/agent-optimization.md",
    ]) {
      expect(existsSync(path.join(base, rel, f)), f).toBe(true);
    }
    expect(existsSync(path.join(base, rel, "_shared"))).toBe(false);

    // Installed skill passes the audit in its new home.
    const audit = run(["audit", path.join(base, rel), "--fail-on", "high", "--quiet"], { cwd: project, env });
    expect(audit.code).toBe(0);

    writeFileSync(path.join(base, rel, "SKILL.md"), "local edit");
    const again = run(["install-skill", "--target", target, "--scope", scope, "--apply"], {
      cwd: project,
      env,
    });
    expect(again.code).toBe(3);
    expect(readFileSync(path.join(base, rel, "SKILL.md"), "utf8")).toBe("local edit");
    expect(
      run(["install-skill", "--target", target, "--scope", scope, "--apply", "--force"], {
        cwd: project,
        env,
      }).code,
    ).toBe(0);
    expect(readFileSync(path.join(base, rel, "SKILL.md"), "utf8")).toMatch(/^---\nname: tokenwise/);
  });

  it("rejects unknown targets and scopes with exit 2", () => {
    const dir = tempDir();
    expect(run(["install-skill", "--target", "cursor", "--scope", "project"], { cwd: dir }).code).toBe(2);
    expect(run(["install-skill", "--target", "claude", "--scope", "global"], { cwd: dir }).code).toBe(2);
    expect(run(["install-skill", "--target", "claude"], { cwd: dir }).code).toBe(2);
  });
});
