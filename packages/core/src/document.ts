/**
 * Line-oriented Markdown/text block model. Deliberately simple and exact: rules and fixes
 * operate on whole lines, so applying a patch never splits a protected span.
 */
export type BlockKind =
  | "frontmatter"
  | "heading"
  | "paragraph"
  | "code"
  | "list"
  | "table"
  | "blockquote"
  | "html";

export interface Block {
  kind: BlockKind;
  /** 1-based inclusive line numbers. */
  startLine: number;
  endLine: number;
  text: string;
  headingLevel?: number;
}

export interface Section {
  heading: Block;
  /** Blocks under this heading until the next heading of any level. */
  body: Block[];
  startLine: number;
  endLine: number;
}

export interface ParsedDocument {
  lines: string[];
  blocks: Block[];
  sections: Section[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

function lineKind(line: string): BlockKind {
  if (/^\s{0,3}#{1,6}\s/.test(line)) return "heading";
  if (/^\s*([-*+]|\d+[.)])\s/.test(line)) return "list";
  if (/^\s*\|.*\|\s*$/.test(line)) return "table";
  if (/^\s{0,3}>/.test(line)) return "blockquote";
  if (/^\s*<[a-zA-Z!/]/.test(line)) return "html";
  return "paragraph";
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function parseDocument(text: string): ParsedDocument {
  const lines = splitLines(text);
  const blocks: Block[] = [];
  let i = 0;
  const push = (kind: BlockKind, start: number, end: number, extra: Partial<Block> = {}) => {
    blocks.push({
      kind,
      startLine: start + 1,
      endLine: end + 1,
      text: lines.slice(start, end + 1).join("\n"),
      ...extra,
    });
  };

  if (lines[0] === "---") {
    const close = lines.findIndex((l, idx) => idx > 0 && l === "---");
    if (close > 0) {
      push("frontmatter", 0, close);
      i = close + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence?.[1]) {
      const marker = fence[1];
      let j = i + 1;
      while (
        j < lines.length &&
        !new RegExp(`^\\s{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[j] ?? "")
      )
        j++;
      push("code", i, Math.min(j, lines.length - 1));
      i = j + 1;
      continue;
    }
    const kind = lineKind(line);
    if (kind === "heading") {
      push("heading", i, i, { headingLevel: (/^\s*(#+)/.exec(line)?.[1] ?? "#").length });
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < lines.length) {
      const next = lines[j + 1] ?? "";
      if (next.trim() === "" || FENCE.test(next) || lineKind(next) === "heading") break;
      // A list may contain indented continuation lines; other kinds end when the line kind changes.
      const nk = lineKind(next);
      if (kind === "list" ? nk !== "list" && !/^\s+\S/.test(next) : nk !== kind && nk !== "paragraph") break;
      if (kind !== "list" && kind !== "paragraph" && nk === "paragraph") break;
      j++;
    }
    push(kind, i, j);
    i = j + 1;
  }

  const sections: Section[] = [];
  let current: Section | null = null;
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (current) sections.push(current);
      current = { heading: b, body: [], startLine: b.startLine, endLine: b.endLine };
    } else if (current) {
      current.body.push(b);
      current.endLine = b.endLine;
    }
  }
  if (current) sections.push(current);
  return { lines, blocks, sections };
}
