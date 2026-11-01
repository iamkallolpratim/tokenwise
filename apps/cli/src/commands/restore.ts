import { listBackups, restoreBackup } from "@tokenwise/core";
import { UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { globals, resolveCwd } from "../context.ts";
import { createOutput, printJson } from "../output/io.ts";

export function registerRestore(program: Command): void {
  program
    .command("restore [backupId]")
    .description("List backups or restore one (restoring is itself backed up)")
    .option("--list", "list backups")
    .option("--force", "restore even if files changed after the backup")
    .option("--format <format>", "text or json", "text")
    .action(
      async (
        id: string | undefined,
        opts: { list?: boolean; force?: boolean; format: string },
        cmd: Command,
      ) => {
        const g = globals(cmd);
        const root = resolveCwd(g);
        const out = createOutput(g);
        if (opts.list || !id) {
          const backups = await listBackups(root);
          if (opts.format === "json") return printJson({ backups });
          if (!backups.length) return out.out("No backups.");
          for (const b of backups) out.out(`${b.id}  ${b.files.length} file(s)  ${b.command}`);
          return;
        }
        if (!id) throw new UsageError("Pass a backup id or --list");
        const r = await restoreBackup(root, id, opts.force ? { force: true } : {});
        if (opts.format === "json")
          return printJson({ restored: r.restored, safetyBackupId: r.safetyBackup?.id ?? null });
        if (!r.restored.length) return out.out("Nothing to restore: files already match the backup.");
        for (const p of r.restored) out.out(`restored ${p}`);
        out.out(`Pre-restore state saved as backup ${r.safetyBackup?.id}.`);
      },
    );
}
