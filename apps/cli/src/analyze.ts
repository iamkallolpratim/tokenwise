import {
  type AuditFinding,
  buildFileContexts,
  type CodeFile,
  computeUsageStats,
  type DiscoveryResult,
  defaultUsagePath,
  type FileContext,
  loadUsage,
  publicFinding,
  runAudit,
  type TokenCounter,
  type UsageStats,
} from "@tokenwise/core";
import { type Finding, type TokenMethod, toRepoPath } from "@tokenwise/shared";
import type { CommandContext } from "./context.ts";
import { discoverCodeFor, discoverFor } from "./discover.ts";

export interface Analysis {
  discovered: DiscoveryResult;
  contexts: FileContext[];
  codeFiles: CodeFile[];
  findings: Finding[];
  rawFindings: AuditFinding[];
  tokens: Map<string, number>;
  method: TokenMethod;
  model: string | null;
  warnings: string[];
}

/** Discovery + token counts + audit, shared by audit, benchmark and report. */
export async function analyze(
  ctx: CommandContext,
  counter: TokenCounter,
  ruleFilter: { only?: string[]; exclude?: string[] } = {},
): Promise<Analysis> {
  const discovered = await discoverFor(ctx);
  const contexts = buildFileContexts(discovered.files, toRepoPath(ctx.root, ctx.target));
  const codeFiles = await discoverCodeFor(ctx);
  const rawFindings = await runAudit(contexts, {
    config: ctx.loaded.config,
    codeFiles,
    counter,
    ...ruleFilter,
  });
  const tokens = new Map<string, number>();
  const warnings = new Set<string>();
  for (const f of discovered.files) {
    const r = await counter.count(f.file.text);
    tokens.set(f.path, r.inputTokens);
    for (const w of r.warnings ?? []) warnings.add(w);
  }
  const probe = await counter.count("");
  for (const w of probe.warnings ?? []) warnings.add(w);
  return {
    discovered,
    contexts,
    codeFiles,
    findings: rawFindings.map(publicFinding),
    rawFindings,
    tokens,
    method: probe.method,
    model: counter.model ?? null,
    warnings: [...warnings],
  };
}

/** Stats from .tokenwise/usage.json under the project root, if tokenwise ingest has run. */
export async function loadUsageStats(root: string): Promise<UsageStats | undefined> {
  const store = await loadUsage(defaultUsagePath(root));
  return store?.records.length ? computeUsageStats(store.records) : undefined;
}

export function now(): string {
  return process.env.TOKENWISE_NOW ?? new Date().toISOString();
}
