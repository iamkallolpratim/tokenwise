/**
 * AI-assisted optimization (disabled by default). The model's answer is only a proposal: it is
 * validated by the same I3 preservation check as deterministic fixes and labeled
 * "AI-proposed, not guaranteed equivalent". Callers handle I1 consent and apply confirmation.
 */
import { normalizeWhitespace, redact } from "@tokenwise/shared";
import { unifiedDiff } from "./diff.ts";
import type { DiscoveredFile } from "./discovery.ts";
import { checkPreservation, extractProtectedSpans, type PreservationViolation } from "./protect.ts";
import type { ModelProvider } from "./providers.ts";
import type { TokenCounter } from "./tokens.ts";

export const AI_LABEL = "AI-proposed, not guaranteed equivalent";

export const AI_SYSTEM_PROMPT = [
  "You rewrite instruction files for AI agents so they use fewer tokens without changing the behavior they produce.",
  "Keep every MUST-KEEP span exactly as written (same characters, same number of occurrences).",
  "Remove filler, pleasantries, repetition and preamble. Do not add new instructions. Do not reorder sections unless it removes duplication.",
  "Return only the complete rewritten file, with no commentary and no code fence around it.",
].join("\n");

export function buildAiInput(path: string, text: string): string {
  const spans = [...new Set(extractProtectedSpans(text).map((s) => s.text))];
  return [
    "MUST-KEEP SPANS (verbatim):",
    ...spans.map((s) => `- ${JSON.stringify(s)}`),
    "",
    `FILE ${path}:`,
    "<<<FILE",
    text,
    "FILE>>>",
  ].join("\n");
}

/** Strips a wrapping code fence or FILE markers the model may add despite instructions. */
export function extractProposal(text: string): string {
  let t = text.replace(/^\s*<<<FILE\n/, "").replace(/\nFILE>>>\s*$/, "\n");
  const fence = /^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(t);
  if (fence?.[1] !== undefined) t = `${fence[1]}\n`;
  return t;
}

export interface AiProposal {
  path: string;
  status: "proposed" | "rejected" | "no-improvement";
  before: string;
  after: string;
  diff: string;
  tokensBefore: number;
  tokensAfter: number;
  violations: PreservationViolation[];
  reason?: string;
}

export async function proposeAiRewrites(
  files: DiscoveredFile[],
  opts: { provider: ModelProvider; model: string; counter: TokenCounter; maxOutputTokens?: number },
): Promise<AiProposal[]> {
  const out: AiProposal[] = [];
  for (const f of files) {
    // Secrets never leave the machine (I5); a file whose redacted form differs is skipped entirely,
    // because a rewrite of the redacted text could not be applied to the original safely.
    const original = f.file.text;
    const tokensBefore = await opts.counter.tokens(original);
    const base = { path: f.path, before: original, tokensBefore };
    if (redact(original) !== original) {
      out.push({
        ...base,
        status: "rejected",
        after: original,
        diff: "",
        tokensAfter: tokensBefore,
        violations: [],
        reason: "file contains secret-like strings; not sent",
      });
      continue;
    }
    const res = await opts.provider.generate({
      model: opts.model,
      system: AI_SYSTEM_PROMPT,
      input: buildAiInput(f.path, original),
      maxOutputTokens: opts.maxOutputTokens ?? Math.max(1024, tokensBefore * 2),
    });
    let proposal = extractProposal(res.text);
    // Keep the original line-ending style.
    if (f.file.lineEnding === "\r\n") proposal = proposal.replace(/\r?\n/g, "\r\n");
    const tokensAfter = await opts.counter.tokens(proposal);
    if (normalizeWhitespace(proposal) === normalizeWhitespace(original) || tokensAfter >= tokensBefore) {
      out.push({
        ...base,
        status: "no-improvement",
        after: original,
        diff: "",
        tokensAfter: tokensBefore,
        violations: [],
      });
      continue;
    }
    const check = checkPreservation(original, proposal);
    if (!check.ok) {
      out.push({
        ...base,
        status: "rejected",
        after: original,
        diff: "",
        tokensAfter: tokensBefore,
        violations: check.violations,
        reason: `${check.violations.length} protected span(s) removed or altered`,
      });
      continue;
    }
    out.push({
      ...base,
      status: "proposed",
      after: proposal,
      diff: unifiedDiff(f.path, original, proposal),
      tokensAfter,
      violations: [],
    });
  }
  return out;
}
