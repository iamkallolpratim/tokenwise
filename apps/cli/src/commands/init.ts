import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { discover, PROJECT_CONFIG_FILE } from "@tokenwise/core";
import { DEFAULT_CONFIG, INIT_CONFIG } from "@tokenwise/shared";
import type { Command } from "commander";
import { globals, resolveCwd } from "../context.ts";
import { createOutput, printJson } from "../output/io.ts";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create .tokenwise/ and tokenwise.config.json, and report detected agent instruction files")
    .option("--force", "overwrite an existing tokenwise.config.json")
    .option("--format <format>", "text or json", "text")
    .action(async (opts: { force?: boolean; format: string }, cmd: Command) => {
      const g = globals(cmd);
      const cwd = resolveCwd(g);
      const out = createOutput(g);
      const configPath = path.join(cwd, PROJECT_CONFIG_FILE);
      const actions: string[] = [];
      await fs.mkdir(path.join(cwd, ".tokenwise"), { recursive: true });
      if (existsSync(configPath) && !opts.force) {
        actions.push(`kept existing ${PROJECT_CONFIG_FILE} (use --force to overwrite)`);
      } else {
        await fs.writeFile(configPath, `${JSON.stringify(INIT_CONFIG, null, 2)}\n`);
        actions.push(`wrote ${PROJECT_CONFIG_FILE}`);
      }
      const gitignore = path.join(cwd, ".gitignore");
      if (existsSync(gitignore)) {
        // Backups and imported usage are local data; keep them out of version control.
        let content = await fs.readFile(gitignore, "utf8");
        const eol = content.includes("\r\n") ? "\r\n" : "\n";
        for (const entry of [".tokenwise/backups/", ".tokenwise/usage.json"]) {
          if (content.split(/\r?\n/).some((l) => l.trim() === entry)) continue;
          const add = `${content.length && !content.endsWith("\n") ? eol : ""}${entry}${eol}`;
          await fs.appendFile(gitignore, add);
          content += add;
          actions.push(`added ${entry} to .gitignore`);
        }
      }
      const result = await discover({ config: DEFAULT_CONFIG, target: cwd, root: cwd });
      const detected = result.files.filter(
        (f) => f.category === "agent-instructions" || f.category === "skill" || f.category === "subagent",
      );
      const claude = detected
        .filter((f) => /(^|\/)(CLAUDE(\.local)?\.md|\.claude\/)/i.test(f.path))
        .map((f) => f.path);
      const codex = detected
        .filter((f) => /(^|\/)(AGENTS(\.override)?\.md|\.agents\/|\.codex\/)/i.test(f.path))
        .map((f) => f.path);
      if (opts.format === "json") {
        printJson({ actions, detected: { claudeCode: claude, codex } });
        return;
      }
      for (const a of actions) out.out(`✓ ${a}`);
      out.out(`Claude Code files: ${claude.length ? claude.join(", ") : "none found"}`);
      out.out(`Codex files:       ${codex.length ? codex.join(", ") : "none found"}`);
      out.out("Next: tokenwise scan, then tokenwise audit");
    });
}
