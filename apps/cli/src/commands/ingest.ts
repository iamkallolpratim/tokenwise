import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  computeUsageStats,
  defaultUsagePath,
  type IngestFileResult,
  ingestUsageFile,
  loadUsage,
  mergeUsage,
  saveUsage,
} from "@tokenwise/core";
import { formatInt, isSecretFile, toPosix, UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { now } from "../analyze.ts";
import { globals, resolveCwd } from "../context.ts";
import { createOutput, printJson } from "../output/io.ts";
import { renderTable } from "../output/table.ts";

interface IngestOpts {
  replace?: boolean;
  dryRun?: boolean;
  format: string;
}

export function registerIngest(program: Command): void {
  program
    .command("ingest <files...>")
    .description(
      "Import recorded usage logs (JSONL: Claude Code transcripts, Anthropic or OpenAI responses) so the agent-loop score has runtime evidence",
    )
    .option("--replace", "discard previously imported usage before importing")
    .option("--dry-run", "parse and summarize without writing .tokenwise/usage.json")
    .option("--format <format>", "text or json", "text")
    .action(async (files: string[], opts: IngestOpts, cmd: Command) => {
      if (!["text", "json"].includes(opts.format))
        throw new UsageError(`Unsupported --format for ingest: ${opts.format}`);
      const g = globals(cmd);
      const cwd = resolveCwd(g);
      const out = createOutput(g);
      const results: IngestFileResult[] = [];
      for (const f of files) {
        const abs = path.resolve(cwd, f);
        if (!existsSync(abs) || !statSync(abs).isFile()) throw new UsageError(`Not a file: ${f}`);
        // I5: never open files that commonly hold credentials, even when named explicitly.
        if (isSecretFile(toPosix(path.basename(abs))))
          throw new UsageError(`Refusing to read ${f}: it looks like a secrets or credentials file.`);
        results.push(await ingestUsageFile(abs));
      }
      const storePath = defaultUsagePath(cwd);
      const existing = opts.replace ? null : await loadUsage(storePath);
      const { store, added, duplicates } = mergeUsage(existing, results, now());
      if (!opts.dryRun) await saveUsage(storePath, store);
      const stats = computeUsageStats(store.records);
      const written = opts.dryRun ? null : toPosix(path.relative(cwd, storePath));

      if (opts.format === "json") {
        printJson({
          schemaVersion: 1,
          written,
          added,
          duplicates,
          files: results.map((r) => ({
            name: r.name,
            records: r.records.length,
            duplicates: r.duplicates,
            ignored: r.ignored,
            invalid: r.invalid,
          })),
          stats,
          method: "provider_api",
        });
        return;
      }
      out.out(
        renderTable(
          [
            { header: "File" },
            { header: "Requests", align: "right" },
            { header: "Duplicates", align: "right" },
            { header: "Ignored", align: "right" },
            { header: "Invalid", align: "right" },
          ],
          results.map((r) => [
            r.name,
            formatInt(r.records.length),
            formatInt(r.duplicates),
            formatInt(r.ignored),
            formatInt(r.invalid),
          ]),
        ),
      );
      const share =
        stats.followUpCacheShare === null ? "n/a" : `${(stats.followUpCacheShare * 100).toFixed(1)}%`;
      out.out(
        [
          `\nAdded ${formatInt(added)} request(s); ${formatInt(duplicates)} already imported or repeated.`,
          `Usage store: ${formatInt(stats.requests)} request(s), ${formatInt(stats.sessions)} session(s), ${formatInt(stats.followUps)} follow-up request(s).`,
          `Input ${formatInt(stats.totalInput)} tokens (cache read ${formatInt(stats.cacheRead)}, cache write ${formatInt(stats.cacheWrite)}, uncached ${formatInt(stats.uncachedInput)}); output ${formatInt(stats.output)}. Counts are provider-reported.`,
          `Cache share on follow-up requests: ${share}.`,
        ].join("\n"),
      );
      if (results.some((r) => r.invalid))
        out.warn("Some lines had usage fields that were missing, negative or inconsistent and were skipped.");
      out.out(
        written
          ? `\nWrote ${written} (numbers, model ids and timestamps only; no message content). tokenwise audit and report now use it.`
          : "\nDry run: nothing was written.",
      );
    });
}
