// Copies skills/ into the CLI package so `install-skill` works from the published tarball.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "skills");
const dest = path.join(root, "apps", "cli", "skills");
rmSync(dest, { recursive: true, force: true });
if (existsSync(src)) {
  cpSync(src, dest, { recursive: true, filter: (p) => !p.includes(`${path.sep}_shared`) });
}
