import { redact, truncate } from "@tokenwise/shared";
import type { FileContext } from "./types.ts";

export interface NormativeStatement {
  polarity: "positive" | "negative";
  object: string;
  text: string;
  line: number;
}

const NEG = /\b(?:must not|mustn't|shall not|never|do not|don't|should not|shouldn't)\b/i;
const POS = /\b(?:must|shall|always|should)\b/i;
const STOP = new Set([
  "a",
  "an",
  "the",
  "you",
  "your",
  "to",
  "in",
  "of",
  "for",
  "and",
  "or",
  "all",
  "any",
  "be",
  "is",
  "are",
  "always",
  "ever",
]);

/** Normalized object of a normative sentence: text after the modal, lowercased, stopwords removed. */
function objectOf(sentence: string, modal: RegExp): string {
  const after = sentence.split(modal).slice(1).join(" ");
  return after
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ")
    .replace(/[.]+$/, "");
}

export function protectedSentencesFor(fc: FileContext): NormativeStatement[] {
  const out: NormativeStatement[] = [];
  for (const b of fc.doc.blocks) {
    if (b.kind === "code" || b.kind === "frontmatter" || b.kind === "heading") continue;
    const lines = b.text.split("\n");
    lines.forEach((raw, i) => {
      for (const sentence of raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").split(/(?<=[.!?])\s+/)) {
        const neg = NEG.test(sentence);
        const pos = !neg && POS.test(sentence);
        if (!neg && !pos) continue;
        const object = objectOf(sentence, neg ? NEG : POS);
        if (object.split(" ").length < 2) continue;
        out.push({
          polarity: neg ? "negative" : "positive",
          object,
          text: truncate(redact(sentence.trim()), 120),
          line: b.startLine + i,
        });
      }
    });
  }
  return out;
}
