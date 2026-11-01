import type { TokenCountResult, TokenwiseConfig } from "@tokenwise/shared";
import { unifiedDiff } from "./diff.ts";
import type { DiscoveredFile } from "./discovery.ts";
import { applyEdits, type LineEdit } from "./edits.ts";
import { type AuditFinding, buildFileContexts, runAudit } from "./engine.ts";
import { checkPreservation, type PreservationViolation } from "./protect.ts";
import type { TokenCounter } from "./tokens.ts";

export interface FileOptimization {
  path: string;
  status: "changed" | "unchanged" | "rejected";
  before: string;
  after: string;
  diff: string;
  appliedRules: string[];
  findingIds: string[];
  tokensBefore: TokenCountResult;
  tokensAfter: TokenCountResult;
  violations: PreservationViolation[];
  rejectionReason?: string;
}

export interface OptimizeResult {
  files: FileOptimization[];
  /** Non-auto-fixable findings: printed as recommendations, never applied. */
  recommendations: AuditFinding[];
}

export interface OptimizeOptions {
  config: TokenwiseConfig;
  counter: TokenCounter;
  targetRepoPath: string;
  only?: string[];
  /** Test hook: transform the text after deterministic fixes (used to prove I3 rejection). */
  postTransform?: (path: string, text: string) => string;
}

const MAX_PASSES = 5;

/**
 * Deterministic optimization: applies only auto-fixable findings, re-auditing until no
 * fix remains (so a second run produces no diff), then verifies I3 for the whole file.
 */
export async function optimizeFiles(files: DiscoveredFile[], opts: OptimizeOptions): Promise<OptimizeResult> {
  const contexts = buildFileContexts(files, opts.targetRepoPath);
  const initial = await runAudit(contexts, {
    config: opts.config,
    counter: opts.counter,
    ...(opts.only ? { only: opts.only } : {}),
  });
  const recommendations = initial.filter((f) => !f.autoFixable);
  const results: FileOptimization[] = [];

  for (const file of files) {
    const original = file.file.text;
    let text = original;
    const deletions: string[] = [];
    const rules = new Set<string>();
    const ids = new Set<string>();
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const current: DiscoveredFile = { ...file, file: { ...file.file, text } };
      const findings = (
        await runAudit(buildFileContexts([current], opts.targetRepoPath), {
          config: opts.config,
          counter: opts.counter,
          ...(opts.only ? { only: opts.only } : {}),
        })
      ).filter((f) => f.autoFixable && f.edits?.length);
      if (findings.length === 0) break;
      const edits: LineEdit[] = findings.flatMap((f) => f.edits ?? []);
      const { text: next, applied } = applyEdits(text, edits, file.file.lineEnding);
      if (next === text) break;
      for (const e of applied) {
        rules.add(e.ruleId);
        if (e.deletedDuplicate) deletions.push(e.deletedDuplicate);
      }
      for (const f of findings) if (f.edits?.some((e) => applied.includes(e))) ids.add(f.id);
      text = next;
    }
    if (opts.postTransform) text = opts.postTransform(file.path, text);

    const tokensBefore = await opts.counter.count(original);
    const base = {
      path: file.path,
      before: original,
      appliedRules: [...rules],
      findingIds: [...ids],
      tokensBefore,
    };
    if (text === original) {
      results.push({
        ...base,
        status: "unchanged",
        after: original,
        diff: "",
        tokensAfter: tokensBefore,
        violations: [],
      });
      continue;
    }
    const check = checkPreservation(original, text, deletions);
    if (!check.ok) {
      results.push({
        ...base,
        status: "rejected",
        after: original,
        diff: "",
        tokensAfter: tokensBefore,
        violations: check.violations,
        rejectionReason: `${check.violations.length} protected span(s) would be removed or altered`,
      });
      continue;
    }
    results.push({
      ...base,
      status: "changed",
      after: text,
      diff: unifiedDiff(file.path, original, text),
      tokensAfter: await opts.counter.count(text),
      violations: [],
    });
  }
  return { files: results, recommendations };
}
