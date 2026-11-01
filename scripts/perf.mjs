// Generates a 5,000-file repository and times `tokenwise scan` and `tokenwise audit` on it.
// Usage: node scripts/perf.mjs [fileCount]
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "apps", "cli", "dist", "index.js");
const count = Number(process.argv[2] ?? 5000);
const dir = mkdtempSync(path.join(os.tmpdir(), "tokenwise-perf-"));

const prose = (i) =>
  `# Package ${i}\n\nYou are working on package ${i}. Always run the tests before finishing. Never commit secrets.\n\n## Rules\n\n- Use strict TypeScript.\n- Prefer small functions.\n\n## Notes\n\nPackage ${i} handles part of the order pipeline and publishes events to the queue after validation.\n`;
for (let i = 0; i < count; i++) {
  const pkg = path.join(dir, "packages", `p${Math.floor(i / 10)}`);
  mkdirSync(pkg, { recursive: true });
  const kind = i % 10;
  if (kind === 0) writeFileSync(path.join(pkg, "AGENTS.md"), prose(i));
  else if (kind === 1) writeFileSync(path.join(pkg, `prompt-${i}.md`), prose(i));
  else if (kind === 2)
    writeFileSync(
      path.join(pkg, `tools-${i}.json`),
      JSON.stringify({
        tools: [
          {
            name: `t${i}`,
            description: "Fetch a record by id.",
            input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
          },
        ],
      }),
    );
  else if (kind === 3)
    writeFileSync(
      path.join(pkg, `agent-${i}.ts`),
      `export async function run(){ while (true) { const r = await callModel({ messages: [] }); if (r.done) return r; } }\n`,
    );
  else if (kind === 4)
    writeFileSync(path.join(pkg, `README-${i}.md`), `# Readme ${i}\n\nGeneral documentation for humans.\n`);
  else if (kind === 5)
    writeFileSync(path.join(pkg, `data-${i}.json`), JSON.stringify({ items: [i, i + 1, i + 2] }));
  else
    writeFileSync(
      path.join(pkg, `notes-${i}.md`),
      `# Notes ${i}\n\nMeeting notes about the roadmap and hiring.\n`,
    );
}
mkdirSync(path.join(dir, ".tokenwise"), { recursive: true });

function time(args) {
  const t = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [cli, ...args, "--quiet"], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  if (r.status !== 0 && r.status !== 1) throw new Error(`${args.join(" ")} failed: ${r.stderr}`);
  return ms;
}
const scan = time(["scan", "--format", "json"]);
const audit = time(["audit", "--format", "json"]);
const result = {
  files: count,
  scanMs: Math.round(scan),
  auditMs: Math.round(audit),
  totalMs: Math.round(scan + audit),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  cpus: os.cpus().length,
};
console.log(JSON.stringify(result));
rmSync(dir, { recursive: true, force: true });
