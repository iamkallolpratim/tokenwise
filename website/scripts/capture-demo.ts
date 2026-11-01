// Runs the built CLI against examples/sample-project (in a temporary copy) and saves what it
// prints, so the landing page shows real output of the current version. Every run preloads the
// test suite's network guard, which kills the CLI on any network access.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ansiToHtml, stripAnsi } from "./lib/ansi.ts";
import { CLI_DIST, DEMO_DATA, PUBLIC, REPO } from "./lib/paths.ts";

if (!existsSync(CLI_DIST)) {
  console.error(`capture-demo: ${path.relative(REPO, CLI_DIST)} not found. Build the CLI first: pnpm build`);
  process.exit(1);
}

const sample = mkdtempSync(path.join(os.tmpdir(), "tokenwise-demo-"));
cpSync(path.join(REPO, "examples", "sample-project"), sample, { recursive: true });
const guard = pathToFileURL(path.join(REPO, "tests", "helpers", "no-network.mjs")).href;

function run(args: string[], opts: { color?: boolean; allowExit?: number[] } = {}): string {
  const r = spawnSync(process.execPath, ["--import", guard, CLI_DIST, ...args], {
    cwd: sample,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: sample,
      TOKENWISE_USER_CONFIG: path.join(sample, "no-user-config.json"),
      ...(opts.color ? { FORCE_COLOR: "1" } : { NO_COLOR: "1" }),
    },
  });
  const ok = [0, ...(opts.allowExit ?? [])];
  if (r.status === null || !ok.includes(r.status))
    throw new Error(`tokenwise ${args.join(" ")} exited ${r.status}:\n${r.stderr}`);
  return r.stdout.replace(/\s+$/, "");
}

const shown = (args: string[]) => `$ tokenwise ${args.join(" ")}`;
function capture(args: string[]) {
  const text = run(args, { color: true });
  return { command: shown(args), html: ansiToHtml(text), text: stripAnsi(text) };
}

try {
  const version = run(["--version"]);
  const auditArgs = ["audit", "--model", "gpt-5", "--severity", "high"];
  const audit = capture(auditArgs);
  const auditJson = JSON.parse(run(["audit", "--model", "gpt-5", "--format", "json"]));
  const optimize = capture(["optimize", "--model", "gpt-5"]);
  run(["benchmark", "--save-baseline", "--model", "gpt-5"]);
  run(["optimize", "--apply", "--model", "gpt-5", "--quiet"]);
  const benchmark = capture(["benchmark", "--model", "gpt-5"]);
  const reportMd = run(["report", "--model", "gpt-5", "--format", "markdown"]);
  // Summary, score breakdown and savings: the part of the report a reader looks at first.
  const excerpt = reportMd.split("\n## Top opportunities")[0] ?? reportMd;
  mkdirSync(path.join(PUBLIC, "demo"), { recursive: true });
  run([
    "report",
    "--model",
    "gpt-5",
    "--format",
    "html",
    "--out",
    path.join(PUBLIC, "demo", "sample-report.html"),
  ]);

  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of auditJson.findings as { severity: string }[])
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  const data = {
    version,
    source: "examples/sample-project",
    audit,
    optimize,
    benchmark,
    report: { command: shown(["report", "--format", "markdown"]), text: excerpt },
    findings: { total: auditJson.findings.length, ...counts },
  };
  mkdirSync(DEMO_DATA, { recursive: true });
  writeFileSync(path.join(DEMO_DATA, "demo.json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`captured demo output from tokenwise ${version} (${data.findings.total} findings)`);
} finally {
  rmSync(sample, { recursive: true, force: true });
}
