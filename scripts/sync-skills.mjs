// Generates skills/*/references/ from skills/_shared/references/ (single source of truth).
// `--check` exits 1 if any generated file is missing or out of date.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shared = path.join(root, "skills", "_shared", "references");
const skills = readdirSync(path.join(root, "skills")).filter(
  (d) => d !== "_shared" && existsSync(path.join(root, "skills", d, "SKILL.md")),
);
const check = process.argv.includes("--check");
const header =
  "<!-- Generated from skills/_shared/references. Edit the source, then run: pnpm sync-skills -->\n";

let drift = 0;
for (const skill of skills) {
  const dest = path.join(root, "skills", skill, "references");
  const expected = new Map(
    readdirSync(shared).map((f) => [f, header + readFileSync(path.join(shared, f), "utf8")]),
  );
  if (check) {
    const actual = existsSync(dest) ? readdirSync(dest) : [];
    for (const f of new Set([...actual, ...expected.keys()])) {
      const want = expected.get(f);
      const have = existsSync(path.join(dest, f)) ? readFileSync(path.join(dest, f), "utf8") : undefined;
      if (want !== have) {
        drift++;
        console.error(`out of date: skills/${skill}/references/${f}`);
      }
    }
    continue;
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const [f, content] of expected) writeFileSync(path.join(dest, f), content);
  console.log(`synced skills/${skill}/references (${expected.size} files)`);
}
if (check && drift) process.exit(1);
