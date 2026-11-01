import { formatInt, redact, type TokenCountResult, UsageError } from "@tokenwise/shared";
import {
  AnthropicApiCounter,
  estimateTokens,
  isAnthropicModel,
  TokenizerRegistry,
} from "@tokenwise/tokenizers";
import type { Command } from "commander";
import { requireEgressConsent } from "../consent.ts";
import { createContext, createCounter } from "../context.ts";
import { discoverFor } from "../discover.ts";
import { printJson } from "../output/io.ts";
import { renderTable } from "../output/table.ts";

export function registerTokens(program: Command): void {
  program
    .command("tokens [path]")
    .description("Count tokens per file and in total, with the counting method for each")
    .option("--model <id>", "model to count for (default: config defaultModel)")
    .option("--format <format>", "text or json", "text")
    .option("--allow-external", "allow provider token-counting APIs (sends content; see Privacy in the docs)")
    .option("--yes", "confirm external calls without a prompt (required when not a TTY)")
    .action(
      async (
        target: string | undefined,
        opts: { model?: string; format: string; allowExternal?: boolean; yes?: boolean },
        cmd: Command,
      ) => {
        if (!["text", "json"].includes(opts.format))
          throw new UsageError(`Unsupported --format for tokens: ${opts.format}`);
        const ctx = createContext(cmd, target);
        const model = opts.model ?? ctx.loaded.config.defaultModel ?? undefined;
        const result = await discoverFor(ctx);
        const registry = new TokenizerRegistry();
        if (opts.allowExternal) {
          if (!model || !isAnthropicModel(model)) {
            ctx.out.warn("--allow-external only affects Anthropic models; counting locally.");
          } else {
            const key = process.env.ANTHROPIC_API_KEY;
            if (!key) throw new UsageError("ANTHROPIC_API_KEY is not set; provider_api counting needs it.");
            await requireEgressConsent(ctx.loaded.config, opts, {
              purpose: "Anthropic token counting",
              destination: "api.anthropic.com (POST /v1/messages/count_tokens)",
              files: result.files.map((f) => ({ path: f.path, tokens: estimateTokens(f.file.text) })),
            });
            registry.register(new AnthropicApiCounter(key));
          }
        }
        const counter = createCounter(ctx, model, registry);
        const rows: { path: string; result: TokenCountResult }[] = [];
        for (const f of result.files)
          rows.push({ path: f.path, result: await counter.count(redact(f.file.text)) });
        const total = rows.reduce((s, r) => s + r.result.inputTokens, 0);
        const methods = [...new Set(rows.map((r) => r.result.method))];
        const warnings = [...new Set(rows.flatMap((r) => r.result.warnings ?? []))];
        if (rows.length === 0) warnings.push(...((await counter.count("")).warnings ?? []));
        if (opts.format === "json") {
          printJson({
            schemaVersion: 1,
            model: model ?? null,
            files: rows.map((r) => ({ path: r.path, ...r.result })),
            total: {
              inputTokens: total,
              method: methods.length === 1 ? methods[0] : methods.length ? "mixed" : "estimated",
              scope: "text",
            },
            warnings: [...new Set(warnings)],
          });
          return;
        }
        ctx.out.out(
          renderTable(
            [
              { header: "File" },
              { header: "Tokens", align: "right" },
              { header: "Method" },
              { header: "Encoding" },
            ],
            rows.map((r) => [
              r.path,
              formatInt(r.result.inputTokens),
              r.result.method,
              r.result.encoding ?? "",
            ]),
          ),
        );
        ctx.out.out(
          `\nTotal: ${formatInt(total)} tokens (${methods.join(", ") || "estimated"}) for model ${model ?? "n/a (none selected)"}`,
        );
        for (const w of new Set(warnings)) ctx.out.warn(w);
      },
    );
}
