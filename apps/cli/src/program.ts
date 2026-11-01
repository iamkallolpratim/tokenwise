import { Command } from "commander";
import { registerAudit } from "./commands/audit.ts";
import { registerBenchmark } from "./commands/benchmark.ts";
import { registerConfig } from "./commands/config.ts";
import { registerHook } from "./commands/hook.ts";
import { registerIngest } from "./commands/ingest.ts";
import { registerInit } from "./commands/init.ts";
import { registerInstallSkill } from "./commands/install-skill.ts";
import { registerOptimize } from "./commands/optimize.ts";
import { registerReport } from "./commands/report.ts";
import { registerRestore } from "./commands/restore.ts";
import { registerScan } from "./commands/scan.ts";
import { registerTokens } from "./commands/tokens.ts";
import { VERSION } from "./version.ts";

export function buildProgram(): Command {
  const program = new Command("tokenwise")
    .description("Reduce token waste. Preserve intelligence.")
    .version(VERSION)
    .option("--quiet", "suppress logs and progress on stderr")
    .option("--verbose", "show classification reasons and debug detail")
    .option("--config <path>", "path to a tokenwise.config.json")
    .option("--cwd <path>", "working directory (default: current directory)")
    .option("--no-color", "disable colored output")
    .showHelpAfterError()
    .exitOverride();
  registerInit(program);
  registerConfig(program);
  registerScan(program);
  registerTokens(program);
  registerAudit(program);
  registerOptimize(program);
  registerRestore(program);
  registerBenchmark(program);
  registerReport(program);
  registerIngest(program);
  registerHook(program);
  registerInstallSkill(program);
  for (const c of program.commands) c.exitOverride();
  return program;
}
