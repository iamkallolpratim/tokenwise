import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeInstall, planInstall, type SkillScope, type SkillTarget } from "@tokenwise/integrations";
import { toPosix, UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { globals, resolveCwd } from "../context.ts";
import { createOutput, printJson } from "../output/io.ts";

/** Skills ship next to dist/ in the published package (apps/cli/skills). */
export function bundledSkillsRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "..", "skills"), path.resolve(here, "..", "..", "..", "skills")];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new UsageError("Bundled skills not found next to the TokenWise CLI.");
  return found;
}

export function registerInstallSkill(program: Command): void {
  program
    .command("install-skill")
    .description("Install the TokenWise skill for Claude Code or Codex (dry run unless --apply)")
    .requiredOption("--target <target>", "claude or codex")
    .requiredOption("--scope <scope>", "project or user")
    .option("--apply", "copy the files")
    .option("--force", "overwrite an existing skill directory")
    .option("--format <format>", "text or json", "text")
    .action(
      async (
        opts: { target: string; scope: string; apply?: boolean; force?: boolean; format: string },
        cmd: Command,
      ) => {
        if (opts.target !== "claude" && opts.target !== "codex")
          throw new UsageError(`--target must be claude or codex, got ${opts.target}`);
        if (opts.scope !== "project" && opts.scope !== "user")
          throw new UsageError(`--scope must be project or user, got ${opts.scope}`);
        const g = globals(cmd);
        const projectRoot = resolveCwd(g);
        const out = createOutput(g);
        const plan = await planInstall({
          skillsRoot: bundledSkillsRoot(),
          target: opts.target as SkillTarget,
          scope: opts.scope as SkillScope,
          projectRoot,
          home: process.env.TOKENWISE_HOME ?? os.homedir(),
        });
        const shown = (p: string) =>
          opts.scope === "project" ? toPosix(path.relative(projectRoot, p)) : toPosix(p);
        if (opts.apply) await executeInstall(plan, opts.force ? { force: true } : {});
        if (opts.format === "json") {
          printJson({
            ...plan,
            applied: Boolean(opts.apply),
            destination: shown(plan.destination),
            files: plan.files.map((f) => shown(f.to)),
            sourceDir: undefined,
          });
          return;
        }
        out.out(
          `${opts.apply ? "Installed" : "Would install"} ${opts.target} skill (${opts.scope} scope) to ${shown(plan.destination)}:`,
        );
        for (const f of plan.files) out.out(`  ${shown(f.to)}`);
        if (!opts.apply) {
          if (plan.exists)
            out.out(`\n${shown(plan.destination)} already exists; --apply needs --force to overwrite it.`);
          out.out("\nDry run: nothing was copied. Re-run with --apply to install.");
        }
      },
    );
}
