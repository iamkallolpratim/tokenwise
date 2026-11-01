/**
 * Exact, structural line edits. Lines keep their own terminators, so untouched lines (and mixed
 * line endings) survive byte-for-byte.
 */
export interface LineEdit {
  /** 1-based inclusive. */
  startLine: number;
  endLine: number;
  /** Replacement line contents, without terminators. Empty = delete. */
  replacement: string[];
  /** Exact text removed as a duplicate (declared to the I3 checker). */
  deletedDuplicate?: string;
  ruleId: string;
}

export interface SplitLine {
  content: string;
  eol: string;
}

export function splitWithEol(text: string): SplitLine[] {
  const out: SplitLine[] = [];
  const re = /([^\r\n]*)(\r\n|\n|$)/g;
  for (const m of text.matchAll(re)) {
    if (m[0] === "" && (m.index ?? 0) >= text.length) break;
    out.push({ content: m[1] ?? "", eol: m[2] ?? "" });
  }
  return out;
}

export function joinLines(lines: SplitLine[]): string {
  return lines.map((l) => l.content + l.eol).join("");
}

/** Applies non-overlapping edits. Overlapping edits keep the first (by start line) and drop the rest. */
export function applyEdits(
  text: string,
  edits: LineEdit[],
  defaultEol: string,
): { text: string; applied: LineEdit[] } {
  const lines = splitWithEol(text);
  const sorted = [...edits].sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
  const accepted: LineEdit[] = [];
  let lastEnd = 0;
  for (const e of sorted) {
    if (e.startLine <= lastEnd) continue;
    accepted.push(e);
    lastEnd = e.endLine;
  }
  for (const e of [...accepted].reverse()) {
    const start = e.startLine - 1;
    const count = e.endLine - e.startLine + 1;
    const lastEol = lines[e.endLine - 1]?.eol ?? defaultEol;
    const repl = e.replacement.map((content, i) => ({
      content,
      eol: i === e.replacement.length - 1 ? lastEol : lines[start + i]?.eol || defaultEol,
    }));
    // Deleting the final line(s) must not leave the previous line without its terminator semantics.
    if (repl.length === 0 && e.endLine >= lines.length && start > 0) {
      const prev = lines[start - 1];
      if (prev) prev.eol = lastEol;
    }
    lines.splice(start, count, ...repl);
  }
  return { text: joinLines(lines), applied: accepted };
}

/**
 * Extends a block deletion to swallow one adjacent blank line so the file does not gain
 * a double blank line where the block used to be.
 */
export function deletionWithSpacing(
  lines: string[],
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } {
  const after = lines[endLine]; // line following the block (0-based index endLine)
  if (after !== undefined && after.trim() === "") return { startLine, endLine: endLine + 1 };
  const before = lines[startLine - 2];
  if (before !== undefined && before.trim() === "") return { startLine: startLine - 1, endLine };
  return { startLine, endLine };
}
