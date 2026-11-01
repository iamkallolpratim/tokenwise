/**
 * Invariant I3: protected content is preserved.
 *
 * Spans are extracted from the original text before a transformation. Afterwards every span must
 * still be present, unaltered (whitespace-normalized). A span may disappear only through a declared
 * deletion of an exact duplicate, and at least one instance must remain.
 */
import { normalizeWhitespace } from "@tokenwise/shared";

export type ProtectedKind =
  | "negation"
  | "normative"
  | "security"
  | "code-block"
  | "inline-code"
  | "url"
  | "path"
  | "endpoint"
  | "identifier"
  | "structured-key"
  | "citation"
  | "output-format";

export interface ProtectedSpan {
  kind: ProtectedKind;
  text: string;
}

const NEGATION =
  /\b(?:never|do not|don't|does not|doesn't|must not|mustn't|cannot|can't|shall not|should not|shouldn't|unless|except|only if|not allowed|no longer|without)\b/i;
const NORMATIVE =
  /\b(?:MUST|SHOULD|SHALL|REQUIRED|MAY NOT|must|required|forbidden|prohibited|mandatory|always|only)\b/;
const SECURITY =
  /\b(?:secret|password|passwd|credential|token|api key|private key|privacy|private|personal data|pii|gdpr|hipaa|permission|authori[sz]|authenticat|approv|human|consent|security|secure|encrypt|confidential|sensitive|production|delete|destroy|irreversible|payment|customer data|email address)/i;
const OUTPUT_FORMAT =
  /\b(?:respond (?:in|with)|output (?:format|as|must)|format(?:ted)? as|schema|json|yaml|xml|return (?:a|an|only|the)|reply (?:in|with)|exactly)\b/i;
const URL = /\bhttps?:\/\/[^\s<>()"'`\]]+/g;
const INLINE_CODE = /`[^`\n]+`/g;
const ENDPOINT = /(?<![\w/.])\/(?:v\d+|api)\/[\w{}\-/.:]+/g;
const PATH =
  /(?<![\w@])(?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:md|mdc|ts|tsx|js|mjs|cjs|json|ya?ml|toml|py|go|rs|sh|sql|env|txt|lock)\b/g;
const IDENTIFIER =
  /\b(?:[a-z]+(?:[A-Z][a-z0-9]+)+|[a-z0-9]+(?:_[a-z0-9]+)+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+)\b/g;
const CITATION =
  /\[\^?\d+\]|\[[A-Z][\w\s.]+,? \d{4}\]|\([A-Z][A-Za-z-]+(?: et al\.)?,? \d{4}[a-z]?\)|^\s*(?:sources?|references?|citations?):.*$/gim;
const FENCE_BLOCK = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}\1[ \t]*$/gm;

/** Splits prose into sentence-ish units: list items and lines are units; long lines split on sentence ends. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const s of trimmed.split(/(?<=[.!?])\s+(?=[A-Z`"'([])/)) if (s.trim()) out.push(s.trim());
  }
  return out;
}

function collectStructuredKeys(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 20 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) collectStructuredKeys(v, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    out.add(k);
    collectStructuredKeys(v, out, depth + 1);
  }
}

export function extractProtectedSpans(text: string, structured?: unknown): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  const add = (kind: ProtectedKind, t: string) => {
    const n = t.trim();
    if (n) spans.push({ kind, text: n });
  };
  for (const m of text.matchAll(FENCE_BLOCK)) add("code-block", m[0]);
  const prose = text.replace(FENCE_BLOCK, "\n");
  for (const s of sentences(prose)) {
    if (NEGATION.test(s)) add("negation", s);
    else if (NORMATIVE.test(s)) add("normative", s);
    if (SECURITY.test(s)) add("security", s);
    if (OUTPUT_FORMAT.test(s)) add("output-format", s);
  }
  for (const m of prose.matchAll(INLINE_CODE)) add("inline-code", m[0]);
  for (const m of prose.matchAll(URL)) add("url", m[0].replace(/[.,;:]+$/, ""));
  for (const m of prose.matchAll(ENDPOINT)) add("endpoint", m[0].replace(/[.,;:]+$/, ""));
  for (const m of prose.matchAll(PATH)) add("path", m[0].replace(/[.,;:]+$/, ""));
  for (const m of prose.matchAll(IDENTIFIER)) add("identifier", m[0]);
  for (const m of prose.matchAll(CITATION)) add("citation", m[0]);
  if (structured !== undefined) {
    const keys = new Set<string>();
    collectStructuredKeys(structured, keys);
    for (const k of keys) add("structured-key", k);
  }
  return spans;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

export interface PreservationViolation {
  kind: ProtectedKind;
  text: string;
  before: number;
  after: number;
  expected: number;
}

export interface PreservationResult {
  ok: boolean;
  violations: PreservationViolation[];
  checked: number;
}

/**
 * Verifies that every protected span of `original` survives in `transformed`.
 * `declaredDeletions` are the exact texts a transformation removed as duplicates; occurrences inside
 * them may disappear, but never the last instance.
 */
export function checkPreservation(
  original: string,
  transformed: string,
  declaredDeletions: string[] = [],
  structured?: unknown,
): PreservationResult {
  const spans = extractProtectedSpans(original, structured);
  const before = normalizeWhitespace(original);
  const after = normalizeWhitespace(transformed);
  const deleted = declaredDeletions.map(normalizeWhitespace);
  const seen = new Set<string>();
  const violations: PreservationViolation[] = [];
  for (const span of spans) {
    const t = normalizeWhitespace(span.text);
    const key = `${span.kind}\u0000${t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const b = countOccurrences(before, t);
    const a = countOccurrences(after, t);
    const removed = deleted.reduce((s, d) => s + countOccurrences(d, t), 0);
    const expected = Math.max(b - removed, b > 0 ? 1 : 0);
    // Allowed: exactly the declared duplicates removed (a === b - removed) with ≥1 left, or nothing removed.
    const okCount = a === b || (a === b - removed && a >= 1);
    if (!okCount) violations.push({ kind: span.kind, text: span.text, before: b, after: a, expected });
  }
  return { ok: violations.length === 0, violations, checked: seen.size };
}
