import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, run } from "../helpers/cli.ts";

describe("release preparation", () => {
  it("the website's reference pages generate from code, and the docs mention only real commands and keys", () => {
    for (const script of ["generate.ts", "check-docs.ts"]) {
      const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "website", "scripts", script)], {
        encoding: "utf8",
      });
      expect(r.stderr, script).toBe("");
      expect(r.status, script).toBe(0);
    }
  });

  it("package metadata is ready for npm without publishing", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "apps", "cli", "package.json"), "utf8"));
    expect(pkg.name).toBe("@klawde91/tokenwise");
    // npm provenance requires repository.url to match the GitHub repository that publishes.
    expect(pkg.repository.url).toBe("git+https://github.com/iamkallolpratim/tokenwise.git");
    expect(pkg.homepage).toMatch(/^https:\/\/.+\/$/);
    expect(pkg.bin.tokenwise).toBe("./dist/index.js");
    expect(pkg.files).toEqual(["dist", "skills", "README.md", "LICENSE"]);
    expect(pkg.engines.node).toBe(">=26.0.0");
    expect(pkg.private).toBeUndefined();
    for (const dep of Object.keys(pkg.dependencies)) expect(dep.startsWith("@tokenwise/")).toBe(false);
    expect(
      readFileSync(path.join(REPO_ROOT, "apps", "cli", "dist", "index.js"), "utf8").startsWith(
        "#!/usr/bin/env node",
      ),
    ).toBe(true);
  });

  it("TokenWise's own docs and skills pass its audit with no HIGH or CRITICAL findings (dogfood)", () => {
    const targets = ["skills", "README.md", "CONTRIBUTING.md", "website/src/content/docs"];
    for (const t of targets) {
      const r = run(["audit", t, "--fail-on", "high", "--format", "json"], { cwd: REPO_ROOT });
      const high = JSON.parse(r.stdout).findings.filter(
        (f: { severity: string }) => f.severity === "HIGH" || f.severity === "CRITICAL",
      );
      expect(high, t).toEqual([]);
      expect(r.code, t).toBe(0);
    }
  });
});
