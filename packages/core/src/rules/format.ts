import type { LineEdit } from "../edits.ts";
import type { DraftFinding, Rule } from "./types.ts";

export const FMT001: Rule = {
  id: "FMT-001",
  category: "format",
  defaultSeverity: "LOW",
  description: "Excess blank lines and trailing whitespace",
  method: "Trailing whitespace and runs of blank lines. Code blocks and frontmatter are left untouched.",
  fixable: true,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      const lines = fc.doc.lines;
      const protectedLines = new Set<number>();
      for (const b of fc.doc.blocks) {
        if (b.kind === "code" || b.kind === "frontmatter")
          for (let l = b.startLine; l <= b.endLine; l++) protectedLines.add(l);
      }
      const edits: LineEdit[] = [];
      let trailing = 0;
      let blankRuns = 0;
      let removedChars = "";
      for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        const line = lines[i] ?? "";
        if (protectedLines.has(lineNo)) continue;
        if (line.trim() === "" && line !== "") {
          // Whitespace-only line: make it empty (counts as trailing whitespace).
          edits.push({ startLine: lineNo, endLine: lineNo, replacement: [""], ruleId: "FMT-001" });
          trailing++;
          removedChars += line;
        } else if (/[ \t]+$/.test(line)) {
          edits.push({
            startLine: lineNo,
            endLine: lineNo,
            replacement: [line.replace(/[ \t]+$/, "")],
            ruleId: "FMT-001",
          });
          trailing++;
          removedChars += /[ \t]+$/.exec(line)?.[0] ?? "";
        }
      }
      // Runs of 2+ blank lines collapse to one. Skip the trailing empty string produced by a final newline.
      const last = lines.length - (lines.at(-1) === "" ? 1 : 0);
      let i = 0;
      while (i < last) {
        if ((lines[i] ?? "").trim() !== "" || protectedLines.has(i + 1)) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < last && (lines[j + 1] ?? "").trim() === "" && !protectedLines.has(j + 2)) j++;
        if (j > i) {
          blankRuns++;
          // Replace the whole run (lines i+1..j+1, 1-based) with a single empty line; drop per-line edits inside it.
          for (let k = edits.length - 1; k >= 0; k--) {
            const e = edits[k];
            if (e && e.startLine >= i + 1 && e.endLine <= j + 1) edits.splice(k, 1);
          }
          edits.push({ startLine: i + 1, endLine: j + 1, replacement: [""], ruleId: "FMT-001" });
          removedChars += "\n".repeat(j - i);
        }
        i = j + 1;
      }
      if (edits.length === 0) continue;
      const parts = [
        trailing && `${trailing} line(s) with trailing whitespace`,
        blankRuns && `${blankRuns} run(s) of extra blank lines`,
      ].filter(Boolean);
      const removed = await ctx.counter.count(removedChars);
      out.push({
        severity: "LOW",
        file: fc.file.path,
        range: {
          startLine: Math.min(...edits.map((e) => e.startLine)),
          endLine: Math.max(...edits.map((e) => e.endLine)),
        },
        description: `${parts.join(" and ")}.`,
        evidence: parts.join("; "),
        estimatedSavings: {
          tokens: removed.inputTokens,
          method: removed.method,
          basis: "estimated",
          confidence: "medium",
        },
        risk: "None for model behavior; code blocks and frontmatter are left untouched.",
        recommendation: "Strip trailing whitespace and collapse repeated blank lines.",
        autoFixable: true,
        kind: "verified",
        edits,
      });
    }
    return out;
  },
};
