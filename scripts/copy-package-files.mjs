// Copies README.md and LICENSE into apps/cli before packing (the npm `files` whitelist includes them).
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of ["README.md", "LICENSE"]) copyFileSync(path.join(root, f), path.join(root, "apps", "cli", f));
