import fillerData from "../data/filler-phrases.json" with { type: "json" };
import type { Block } from "../document.ts";
import { evidence, hashNorm } from "./helpers.ts";
import type { DraftFinding, FileContext, Rule } from "./types.ts";

const PHRASES: readonly string[] = fillerData.phrases;
const PHRASE_RE = new RegExp(
  `\\b(?:${PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]")).join("|")})\\b`,
  "gi",
);

export const VERB001: Rule = {
  id: "VERB-001",
  category: "verbosity",
  defaultSeverity: "LOW",
  description: "Filler and politeness phrases",
  method: "Matches a phrase list (packages/core/src/data/filler-phrases.json). Never auto-fixed.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      for (const b of fc.doc.blocks) {
        if (b.kind === "code" || b.kind === "frontmatter") continue;
        const text = b.text.replace(/`[^`]*`/g, "");
        const hits = [...text.matchAll(PHRASE_RE)].map((m) => m[0]);
        if (hits.length === 0) continue;
        const tokens = await ctx.counter.count(hits.join(" "));
        out.push({
          idKey: `${hits.map((h) => h.toLowerCase()).join("|")}\u0000${hashNorm(b.text)}`,
          severity: "LOW",
          file: fc.file.path,
          range: { startLine: b.startLine, endLine: b.endLine },
          description: `Filler phrase(s): ${[...new Set(hits.map((h) => `"${h.toLowerCase()}"`))].join(", ")}.`,
          evidence: evidence(b.text),
          estimatedSavings: {
            tokens: tokens.inputTokens,
            basis: "potential",
            confidence: "medium",
            method: tokens.method,
          },
          risk: "Low, but rewording is a judgment call: some phrases soften or emphasize an instruction on purpose.",
          recommendation:
            'State the instruction directly (e.g. "Please make sure to always run X" → "Always run X").',
          autoFixable: false,
          kind: "verified",
        });
      }
    }
    return out;
  },
};

const INSTRUCTION =
  /\b(?:must|should|shall|never|always|do not|don't|only|avoid|ensure|use|run|prefer|keep|write|add|call|return|respond|follow|check|required?)\b/i;
const SOCIAL =
  /\b(?:hello|hi|hey|thank|thanks|appreciate|hope|enjoy|wonderful|welcome|glad|cheers|excited|happy to|look forward)\b/i;

function isFluff(b: Block): boolean {
  if (b.kind !== "paragraph") return false;
  if (/`|https?:\/\//.test(b.text)) return false;
  // "Let us know…" is a courtesy, not an instruction to the model.
  const withoutCourtesy = b.text.replace(/\blet us know\b[^.!?]*[.!?]?/gi, "");
  return SOCIAL.test(b.text) && !INSTRUCTION.test(withoutCourtesy);
}

export const VERB002: Rule = {
  id: "VERB-002",
  category: "verbosity",
  defaultSeverity: "LOW",
  description: "Preamble or outro with no instructions",
  method: "First or last paragraph made of social words with no instruction verbs. Never auto-fixed.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const check = async (fc: FileContext, b: Block | undefined, where: "preamble" | "outro") => {
      if (!b || !isFluff(b)) return;
      const r = await ctx.counter.count(b.text);
      out.push({
        idKey: `${where}\u0000${hashNorm(b.text)}`,
        severity: "LOW",
        file: fc.file.path,
        range: { startLine: b.startLine, endLine: b.endLine },
        description: `${where === "preamble" ? "Opening" : "Closing"} paragraph is social text with no instruction or constraint.`,
        evidence: evidence(b.text),
        estimatedSavings: {
          tokens: r.inputTokens,
          basis: "potential",
          confidence: "medium",
          method: r.method,
        },
        risk: "Low: the paragraph contains no instruction, but check it does not set tone the agent should keep.",
        recommendation: `Remove the ${where}, or replace it with one line of context the agent needs.`,
        autoFixable: false,
        kind: "verified",
      });
    };
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      const body = fc.doc.blocks.filter((b) => b.kind !== "heading" && b.kind !== "frontmatter");
      await check(fc, body[0], "preamble");
      if (body.length > 1) await check(fc, body.at(-1), "outro");
    }
    return out;
  },
};
