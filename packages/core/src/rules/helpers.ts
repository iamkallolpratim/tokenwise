import { normalizeWhitespace, redact, sha256, truncate } from "@tokenwise/shared";
import type { Block, Section } from "../document.ts";
import { extractProtectedSpans } from "../protect.ts";
import type { FileContext } from "./types.ts";

/** Block kinds that carry prose content worth comparing for duplication. */
export const CONTENT_KINDS = new Set(["paragraph", "list", "blockquote", "table"]);
export const MIN_DUP_CHARS = 40;

export function norm(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

export function hashNorm(text: string): string {
  return sha256(normalizeWhitespace(text));
}

export function evidence(text: string, max = 160): string {
  return truncate(redact(normalizeWhitespace(text)), max);
}

export function hasProtectedSpans(text: string): boolean {
  return extractProtectedSpans(text).some((s) => s.kind !== "identifier" && s.kind !== "path");
}

export function sectionOf(fc: FileContext, block: Block): Section | undefined {
  return fc.doc.sections.find((s) => block.startLine >= s.startLine && block.endLine <= s.endLine);
}

export function contentBlocks(fc: FileContext): Block[] {
  return fc.doc.blocks.filter(
    (b) => CONTENT_KINDS.has(b.kind) && normalizeWhitespace(b.text).length >= MIN_DUP_CHARS,
  );
}

/** Word 5-shingles for near-duplicate detection. */
export function shingles(text: string, size = 5): Set<string> {
  const words = norm(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function wordCount(text: string): number {
  return normalizeWhitespace(text).split(" ").filter(Boolean).length;
}

export function sectionText(s: Section): string {
  return [s.heading.text, ...s.body.map((b) => b.text)].join("\n\n");
}

export function lineRef(start: number, end: number): string {
  return start === end ? `line ${start}` : `lines ${start}-${end}`;
}
