import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI = path.join(REPO_ROOT, "apps", "cli", "dist", "index.js");
export const SAMPLE = path.join(REPO_ROOT, "examples", "sample-project");

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export const NO_NETWORK = path.join(REPO_ROOT, "tests", "helpers", "no-network.mjs");

export function run(
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; input?: string; allowNetwork?: boolean },
): RunResult {
  const guard = opts.allowNetwork ? [] : ["--import", pathToFileURL(NO_NETWORK).href];
  const r = spawnSync(process.execPath, [...guard, CLI, ...args], {
    cwd: opts.cwd,
    encoding: "utf8",
    input: opts.input ?? "",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: opts.env?.HOME ?? os.tmpdir(),
      NO_COLOR: "1",
      TOKENWISE_USER_CONFIG: path.join(os.tmpdir(), "tokenwise-nonexistent-user-config.json"),
      ...opts.env,
    },
  });
  if (r.stderr.includes("NETWORK_ATTEMPT_BLOCKED"))
    throw new Error(`CLI attempted network access: ${r.stderr}`);
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

export function tempDir(prefix = "tokenwise-test-"): string {
  return realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** Copies the sample project into a fresh temp directory so tests can modify it. */
export function sampleCopy(): string {
  const dir = tempDir("tokenwise-sample-");
  cpSync(SAMPLE, dir, { recursive: true });
  return dir;
}
