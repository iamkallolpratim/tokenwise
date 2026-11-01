import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEBSITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPO = path.resolve(WEBSITE, "..");
export const DOCS = path.join(WEBSITE, "src", "content", "docs", "docs");
export const GENERATED_DATA = path.join(WEBSITE, "src", "data", "generated");
export const DEMO_DATA = path.join(WEBSITE, "src", "data", "demo");
export const PUBLIC = path.join(WEBSITE, "public");
export const CLI_DIST = path.join(REPO, "apps", "cli", "dist", "index.js");
