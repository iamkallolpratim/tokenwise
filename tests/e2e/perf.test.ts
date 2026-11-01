import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";
import { REPO_ROOT } from "../helpers/cli.ts";

// Target: under 10 s on a typical laptop. The bound here is looser so shared CI runners do not flake;
// the measured number is printed and recorded in the delivery notes.
it("scan + audit on a generated 5,000-file repository", () => {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "perf.mjs"), "5000"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  expect(r.status, r.stderr).toBe(0);
  const result = JSON.parse(r.stdout);
  process.stderr.write(`perf: ${r.stdout}`);
  expect(result.totalMs).toBeLessThan(30_000);
}, 120_000);
