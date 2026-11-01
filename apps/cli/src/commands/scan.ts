import { parseDocument, readAuditCache } from "@tokenwise/core";
import { formatInt, type Severity, toRepoPath, UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { createContext, createCounter } from "../context.ts";
import { discoverFor } from "../discover.ts";
import { printJson } from "../output/io.ts";
import { renderTable } from "../output/table.ts";

interface ScanRow {
  path: string;
  category: string;
  reasons: string[];
  characters: number;
  tokens: { count: number; method: string; encoding?: string };
  sections: number;
  findings: Partial<Record<Severity, number>> | null;
}

export function registerScan(program: Command): void {
  program
    .command("scan [path]")
    .description("Discover AI-relevant files (instructions, skills, prompts, tool schemas, agent/RAG config)")
    .option("--format <format>", "text or json", "text")
    .option("--model <id>", "model used for token counts")
    .action(async (target: string | undefined, opts: { format: string; model?: string }, cmd: Command) => {
      if (!["text", "json"].includes(opts.format))
        throw new UsageError(`Unsupported --format for scan: ${opts.format}`);
      const ctx = createContext(cmd, target);
      const counter = createCounter(ctx, opts.model);
      const result = await discoverFor(ctx);
      const cache = await readAuditCache(ctx.root);
      const rows: ScanRow[] = [];
      const warnings = new Set<string>();
      for (const f of result.files) {
        const tc = await counter.count(f.file.text);
        for (const w of tc.warnings ?? []) warnings.add(w);
        const sev: Partial<Record<Severity, number>> = {};
        for (const fi of cache?.findings ?? [])
          if (fi.file === f.path) sev[fi.severity] = (sev[fi.severity] ?? 0) + 1;
        rows.push({
          path: f.path,
          category: f.category,
          reasons: f.reasons,
          characters: f.file.text.length,
          tokens: {
            count: tc.inputTokens,
            method: tc.method,
            ...(tc.encoding ? { encoding: tc.encoding } : {}),
          },
          sections: parseDocument(f.file.text).sections.length,
          findings: cache ? sev : null,
        });
      }
      const total = rows.reduce((s, r) => s + r.tokens.count, 0);
      const method = rows[0]?.tokens.method ?? (await counter.method());
      if (opts.format === "json") {
        printJson({
          schemaVersion: 1,
          target: toRepoPath(ctx.root, ctx.target),
          model: counter.model ?? null,
          files: rows,
          totals: { files: rows.length, tokens: total, method },
          skipped: result.skipped.filter((s) => s.reason !== "ignored"),
          warnings: [...warnings],
        });
        return;
      }
      const { colors: c } = ctx.out;
      if (rows.length === 0) {
        ctx.out.out("No AI-relevant files found.");
      } else {
        const sevCell = (r: ScanRow) =>
          r.findings
            ? (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
                .filter((s) => r.findings?.[s])
                .map((s) => `${s[0]}:${r.findings?.[s]}`)
                .join(" ") || "-"
            : "n/a";
        ctx.out.out(
          renderTable(
            [
              { header: "File" },
              { header: "Category" },
              { header: "Chars", align: "right" },
              { header: "Tokens", align: "right" },
              { header: "Method" },
              { header: "Sections", align: "right" },
              { header: "Findings" },
            ],
            rows.map((r) => [
              r.path,
              r.category,
              formatInt(r.characters),
              formatInt(r.tokens.count),
              r.tokens.method,
              String(r.sections),
              sevCell(r),
            ]),
          ),
        );
        if (ctx.out.verbose) for (const r of rows) ctx.out.out(c.dim(`  ${r.path}: ${r.reasons.join("; ")}`));
        ctx.out.out(`\n${rows.length} files, ${formatInt(total)} tokens (${method})`);
      }
      for (const w of warnings) ctx.out.warn(w);
    });
}
