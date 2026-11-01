// Runs the Astro CLI with Astro's anonymous usage telemetry disabled (TokenWise has no telemetry,
// and the website build should not send any either).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const bin = path.join(path.dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
});
process.exit(r.status ?? 1);
