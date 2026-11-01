// Regressions found by testing the published 0.1.0 package end to end.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI, NO_NETWORK, run, sampleCopy } from "../helpers/cli.ts";

describe("tokens", () => {
  it("counts files as written, matching scan, even when a file contains a secret", () => {
    const dir = sampleCopy();
    const scan = JSON.parse(run(["scan", "--format", "json", "--model", "gpt-5"], { cwd: dir }).stdout);
    const tokens = JSON.parse(run(["tokens", "--format", "json", "--model", "gpt-5"], { cwd: dir }).stdout);
    const scanned = Object.fromEntries(
      scan.files.map((f: { path: string; tokens: { count: number } }) => [f.path, f.tokens.count]),
    );
    const counted = Object.fromEntries(
      tokens.files.map((f: { path: string; inputTokens: number }) => [f.path, f.inputTokens]),
    );
    // prompts/support-system.md holds a (fake) API key; 0.1.0 counted it after redaction.
    expect(counted).toEqual(scanned);
    expect(tokens.total.inputTokens).toBe(scan.totals.tokens);
    // The count itself is never a reason to print the secret.
    expect(JSON.stringify(tokens)).not.toContain("Hq7Vw2LmRt9KpXz4");
  });
});

describe.skipIf(process.platform === "win32")("closed output pipe", () => {
  const piped = (dir: string, args: string[]) =>
    spawnSync(
      "bash",
      [
        "-c",
        `"${process.execPath}" --import "${pathToFileURL(NO_NETWORK).href}" "${CLI}" ${args.join(" ")} 2>stderr.txt | true; echo "\${PIPESTATUS[0]}"`,
      ],
      { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: dir, NO_COLOR: "1" } },
    );

  it("optimize --apply finishes and exits 0 when the reader closes early", () => {
    const dir = sampleCopy();
    const before = readFileSync(path.join(dir, "CLAUDE.md"));
    const r = piped(dir, ["optimize", "--apply", "--model", "gpt-5"]);
    expect(r.stdout.trim()).toBe("0");
    expect(readFileSync(path.join(dir, "stderr.txt"), "utf8")).not.toMatch(/EPIPE|Unhandled/);
    expect(readFileSync(path.join(dir, "CLAUDE.md"))).not.toEqual(before);
    expect(readdirSync(path.join(dir, ".tokenwise", "backups"))).toHaveLength(1);
  });

  it("audit exits 0 without an error when piped into a reader that stops early", () => {
    const dir = sampleCopy();
    const r = piped(dir, ["audit", "--verbose"]);
    expect(r.stdout.trim()).toBe("0");
    expect(readFileSync(path.join(dir, "stderr.txt"), "utf8")).not.toMatch(/EPIPE|Unhandled/);
  });
});
