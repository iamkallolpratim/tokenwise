// Lighthouse CI against the built site served by `astro preview` under the configured base path.
// Fails if any category on any checked page scores below 0.95 (mobile emulation, Lighthouse's
// default). Needs a Chrome or Chromium binary (preinstalled on GitHub's Ubuntu runners; set
// CHROME_PATH elsewhere). Results are written to website/.lighthouseci/.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { BASE_PATH } from "../site.config.mjs";
import { WEBSITE } from "./lib/paths.ts";

const PORT = 4329;
const pages = [
  "",
  "docs/",
  "docs/getting-started/quickstart/",
  "docs/reference/rules/",
  "docs/reference/cli/",
];
const min = ["error", { minScore: 0.95 }];
const config = {
  ci: {
    collect: {
      startServerCommand: `node scripts/astro.ts preview --port ${PORT}`,
      startServerReadyPattern: `localhost:${PORT}`,
      url: pages.map((p) => `http://localhost:${PORT}${BASE_PATH}${p}`),
      numberOfRuns: 1,
      settings: { chromeFlags: "--headless=new --no-sandbox" },
    },
    assert: {
      assertions: {
        "categories:performance": min,
        "categories:accessibility": min,
        "categories:best-practices": min,
        "categories:seo": min,
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
const rc = path.join(WEBSITE, ".lighthouserc.json");
writeFileSync(rc, `${JSON.stringify(config, null, 2)}\n`);
const r = spawnSync("npx", ["--yes", "@lhci/cli@0.15.1", "autorun", `--config=${rc}`], {
  cwd: WEBSITE,
  stdio: "inherit",
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", LHCI_BUILD_CONTEXT__CURRENT_HASH: "local" },
});
process.exit(r.status ?? 1);
