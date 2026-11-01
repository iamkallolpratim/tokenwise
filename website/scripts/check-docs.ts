// Checks that the documentation only mentions things that exist. Needs the generated CLI and config
// data (node scripts/generate.ts), not a site build. Exits non-zero on any failure.
//   commands  every `tokenwise …` command and its flags exist in the CLI (docs, landing page,
//             README, CONTRIBUTING and the skills)
//   flags     every option written in backticks exists on some command
//   config    every config key written in backticks exists in the config schema
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { DOCS, GENERATED_DATA, REPO, WEBSITE } from "./lib/paths.ts";

const errors: string[] = [];
const fail = (check: string, msg: string) => errors.push(`[${check}] ${msg}`);

async function files(dir: string, ext: RegExp): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p, ext)));
    else if (ext.test(e.name)) out.push(p);
  }
  return out.sort();
}

type CliOption = { long: string | null };
type CliCommand = { path: string; options: CliOption[]; subcommands: string[] };
const cli = JSON.parse(readFileSync(path.join(GENERATED_DATA, "cli.json"), "utf8")) as {
  globals: CliOption[];
  commands: CliCommand[];
};
const configKeys = new Set(
  (JSON.parse(readFileSync(path.join(GENERATED_DATA, "config.json"), "utf8")) as { key: string }[]).map(
    (r) => r.key,
  ),
);
const topLevelKeys = new Set([...configKeys].filter((k) => !k.includes(".")));
const byPath = new Map(cli.commands.map((c) => [c.path, c]));
const globalFlags = new Set(cli.globals.map((o) => o.long).filter(Boolean));
const allFlags = new Set([...globalFlags, ...cli.commands.flatMap((c) => c.options.map((o) => o.long))]);
// Flags of other tools that appear in the docs (npm, npx, pnpm).
const foreignFlags = new Set([
  "--no-install",
  "--frozen-lockfile",
  "--global",
  "--prefix",
  "--filter",
  "--help",
  "--version",
]);

const docSources = [
  ...(await files(path.join(WEBSITE, "src", "content", "docs"), /\.mdx?$/)),
  ...(await files(path.join(WEBSITE, "src", "pages"), /\.astro$/)),
  path.join(REPO, "README.md"),
  path.join(REPO, "CONTRIBUTING.md"),
  ...(await files(path.join(REPO, "skills"), /\.md$/)),
];

const COMMAND =
  /(?:npx (?:--no-install )?@klawde\/tokenwise|(?<![\w.@/-])tokenwise)[ \t]+([a-z][a-z-]*)([^\n`|#;)]*)/g;
let commandsChecked = 0;
for (const file of docSources) {
  const text = readFileSync(file, "utf8");
  const where = path.relative(REPO, file);
  for (const m of text.matchAll(COMMAND)) {
    const name = m[1] ?? "";
    const rest = (m[2] ?? "").trim().split(/\s+/).filter(Boolean);
    let cmd = byPath.get(name);
    if (!cmd) {
      fail("commands", `${where}: "tokenwise ${name}" is not a command`);
      continue;
    }
    if (cmd.subcommands.length && rest[0] && /^[a-z]/.test(rest[0])) {
      const sub = byPath.get(`${name} ${rest[0]}`);
      if (!sub) {
        fail("commands", `${where}: "tokenwise ${name} ${rest[0]}" is not a command`);
        continue;
      }
      cmd = sub;
    }
    const valid = new Set([...globalFlags, ...cmd.options.map((o) => o.long)]);
    for (const tok of rest) {
      if (!tok.startsWith("--")) continue;
      const flag = tok.replace(/[=,.:]+.*$/, "").replace(/[^a-z-]+$/, "");
      if (!valid.has(flag)) fail("commands", `${where}: tokenwise ${cmd.path} has no option ${flag}`);
    }
    commandsChecked++;
  }
  for (const m of text.matchAll(/`(--[a-z][a-z-]*)(?:[ =][^`]*)?`/g)) {
    const flag = m[1] ?? "";
    if (!allFlags.has(flag) && !foreignFlags.has(flag))
      fail("commands", `${where}: no command has the option ${flag}`);
  }
  if (file.startsWith(DOCS) || file.startsWith(path.join(WEBSITE, "src"))) {
    for (const m of text.matchAll(/`([a-z][A-Za-z]*(?:\.[A-Za-z<>]+)+)`/g)) {
      const key = m[1] ?? "";
      if (!topLevelKeys.has(key.split(".")[0] ?? "")) continue;
      if (!configKeys.has(key)) fail("config", `${where}: config key ${key} does not exist`);
    }
  }
}
if (commandsChecked < 50)
  fail("commands", `only ${commandsChecked} command mentions found; the extractor is probably broken`);

if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`\ncheck-docs: ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`check-docs: ${commandsChecked} command mentions in ${docSources.length} files: OK`);
