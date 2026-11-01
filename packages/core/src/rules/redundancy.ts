import type { Block, Section } from "../document.ts";
import { deletionWithSpacing } from "../edits.ts";
import {
  contentBlocks,
  evidence,
  hashNorm,
  hasProtectedSpans,
  jaccard,
  lineRef,
  sectionOf,
  sectionText,
  shingles,
  wordCount,
} from "./helpers.ts";
import type { DraftFinding, FileContext, Rule, RuleContext } from "./types.ts";

async function savings(
  ctx: RuleContext,
  text: string,
  basis: "estimated" | "potential",
  confidence: "high" | "medium" | "low",
) {
  const r = await ctx.counter.count(text);
  return { tokens: r.inputTokens, basis, confidence, method: r.method };
}

function deleteEdit(fc: FileContext, startLine: number, endLine: number, ruleId: string, text: string) {
  const span = deletionWithSpacing(fc.doc.lines, startLine, endLine);
  return { ...span, replacement: [], deletedDuplicate: text, ruleId };
}

/** Sections (heading + body) whose normalized text exactly repeats an earlier section in the same file. */
export function duplicateSections(fc: FileContext): { first: Section; dup: Section; index: number }[] {
  const seen = new Map<string, Section>();
  const out: { first: Section; dup: Section; index: number }[] = [];
  for (const s of fc.doc.sections) {
    if (s.body.length === 0) continue;
    const h = hashNorm(sectionText(s));
    const first = seen.get(h);
    if (first) out.push({ first, dup: s, index: out.length });
    else seen.set(h, s);
  }
  return out;
}

const insideAny = (b: Block, sections: Section[]) =>
  sections.some((s) => b.startLine >= s.startLine && b.endLine <= s.endLine);

export const RED001: Rule = {
  id: "RED-001",
  category: "redundancy",
  defaultSeverity: "MEDIUM",
  description: "Exact duplicate paragraph within a file",
  method:
    "Whitespace-normalized hash of paragraph, list and table blocks of at least 40 characters. Severity rises to HIGH when the duplicate is 50+ tokens in an always-loaded file. Auto-fixed only when both copies are in the same section, or the paragraph holds no protected statements.",
  fixable: true,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      const dupSections = duplicateSections(fc).map((d) => d.dup);
      const seen = new Map<string, Block>();
      let n = 0;
      for (const b of contentBlocks(fc)) {
        if (insideAny(b, dupSections)) continue;
        const h = hashNorm(b.text);
        const first = seen.get(h);
        if (!first) {
          seen.set(h, b);
          continue;
        }
        // Deleting a protected statement is safe only when its other copy has the same context (I3 scope).
        const sameSection = sectionOf(fc, first) === sectionOf(fc, b);
        const autoFixable = sameSection || !hasProtectedSpans(b.text);
        const s = await savings(ctx, b.text, "estimated", "high");
        out.push({
          idKey: String(n++),
          severity: fc.alwaysLoaded && s.tokens >= 50 ? "HIGH" : "MEDIUM",
          file: fc.file.path,
          range: { startLine: b.startLine, endLine: b.endLine },
          relatedLocations: [{ file: fc.file.path, startLine: first.startLine, endLine: first.endLine }],
          description: `Paragraph repeats ${lineRef(first.startLine, first.endLine)} exactly.`,
          evidence: evidence(b.text),
          estimatedSavings: s,
          risk: autoFixable
            ? "Low: an identical copy remains in the same scope."
            : "Medium: the copies sit under different headings, so each may be read in its own context.",
          recommendation: autoFixable
            ? "Remove the second copy."
            : "Keep one copy in the section where it applies, or move it to a shared section.",
          autoFixable,
          kind: "verified",
          ...(autoFixable ? { edits: [deleteEdit(fc, b.startLine, b.endLine, "RED-001", b.text)] } : {}),
        });
      }
    }
    return out;
  },
};

export const RED002: Rule = {
  id: "RED-002",
  category: "redundancy",
  defaultSeverity: "MEDIUM",
  description: "Exact duplicate section (heading and body)",
  method:
    "Hash of a heading plus its body. Severity rises to HIGH as for RED-001. Always auto-fixable: the identical section, heading included, remains.",
  fixable: true,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      for (const { first, dup, index } of duplicateSections(fc)) {
        const text = fc.doc.lines.slice(dup.startLine - 1, dup.endLine).join("\n");
        const s = await savings(ctx, text, "estimated", "high");
        out.push({
          idKey: String(index),
          severity: fc.alwaysLoaded && s.tokens >= 50 ? "HIGH" : "MEDIUM",
          file: fc.file.path,
          range: { startLine: dup.startLine, endLine: dup.endLine },
          relatedLocations: [{ file: fc.file.path, startLine: first.startLine, endLine: first.endLine }],
          description: `Section "${dup.heading.text.replace(/^#+\s*/, "")}" repeats ${lineRef(first.startLine, first.endLine)} exactly.`,
          evidence: evidence(text),
          estimatedSavings: s,
          risk: "Low: the identical section, with the same heading, remains.",
          recommendation: "Remove the repeated section.",
          autoFixable: true,
          kind: "verified",
          edits: [deleteEdit(fc, dup.startLine, dup.endLine, "RED-002", text)],
        });
      }
    }
    return out;
  },
};

export const RED003: Rule = {
  id: "RED-003",
  category: "redundancy",
  defaultSeverity: "LOW",
  description: "Near-duplicate paragraphs (word 5-shingle Jaccard similarity)",
  method:
    "Word 5-shingles compared with Jaccard similarity at or above thresholds.nearDuplicateJaccard (0.8), for blocks of at least 15 words. Never auto-fixed: near-duplicates can differ in a word that matters.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const threshold = ctx.config.thresholds.nearDuplicateJaccard;
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      const blocks = contentBlocks(fc)
        .filter((b) => wordCount(b.text) >= 15)
        .slice(0, 2000);
      const sh = blocks.map((b) => shingles(b.text));
      const exact = new Set<string>();
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const a = blocks[i];
          const b = blocks[j];
          const sa = sh[i];
          const sb = sh[j];
          if (!a || !b || !sa || !sb) continue;
          if (hashNorm(a.text) === hashNorm(b.text)) continue;
          const sim = jaccard(sa, sb);
          if (sim < threshold || exact.has(`${j}`)) continue;
          exact.add(`${j}`);
          out.push({
            idKey: `${hashNorm(a.text)}\u0000${hashNorm(b.text)}`,
            severity: "LOW",
            file: fc.file.path,
            range: { startLine: b.startLine, endLine: b.endLine },
            relatedLocations: [{ file: fc.file.path, startLine: a.startLine, endLine: a.endLine }],
            description: `Paragraph is ${(sim * 100).toFixed(0)}% similar (5-shingle Jaccard) to ${lineRef(a.startLine, a.endLine)}.`,
            evidence: evidence(b.text),
            estimatedSavings: await savings(ctx, b.text, "potential", "medium"),
            risk: "Medium: near-duplicates often differ in a detail that matters (a value, a negation, a scope).",
            recommendation:
              "Compare both paragraphs, merge them into one, and keep every distinct requirement.",
            autoFixable: false,
            kind: "verified",
          });
        }
      }
    }
    return out;
  },
};

export const RED004: Rule = {
  id: "RED-004",
  category: "redundancy",
  defaultSeverity: "MEDIUM",
  description: "Same block in multiple agent instruction files",
  method:
    "Block hash across agent-instruction files (CLAUDE.md, AGENTS.md, nested copies). One finding per set of files that share blocks. Savings are potential: not every harness loads both files.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const files = ctx.files.filter((f) => f.isProse && f.file.category === "agent-instructions");
    const index = new Map<string, { fc: FileContext; block: Block }[]>();
    for (const fc of files) {
      for (const b of contentBlocks(fc)) {
        const h = hashNorm(b.text);
        const list = index.get(h) ?? [];
        if (!list.some((e) => e.fc === fc)) list.push({ fc, block: b });
        index.set(h, list);
      }
    }
    // One finding per set of files sharing blocks (not per pair), so n files sharing a block
    // yield one finding instead of n²/2.
    const groups = new Map<string, { files: FileContext[]; shared: { fc: FileContext; block: Block }[][] }>();
    for (const entries of index.values()) {
      if (entries.length < 2) continue;
      const key = entries.map((e) => e.fc.file.path).join("\u0000");
      const g = groups.get(key) ?? { files: entries.map((e) => e.fc), shared: [] };
      g.shared.push(entries);
      groups.set(key, g);
    }
    for (const { files: set, shared } of groups.values()) {
      const primary = set.at(-1);
      if (!primary) continue;
      const primaryBlocks = shared
        .map((entries) => entries.find((e) => e.fc === primary)?.block)
        .filter((b): b is Block => !!b);
      const text = primaryBlocks.map((b) => b.text).join("\n\n");
      const one = await savings(ctx, text, "potential", "medium");
      const s = { ...one, tokens: one.tokens * (set.length - 1) };
      const names = set.map((f) => f.file.path.split("/").pop()?.toLowerCase());
      const claudeAgents = set.length === 2 && names.includes("claude.md") && names.includes("agents.md");
      const others = set.slice(0, -1);
      const where =
        set.length === 2
          ? `between ${others[0]?.file.path} and ${primary.file.path}`
          : `across ${set.length} files (${set
              .slice(0, 5)
              .map((f) => f.file.path)
              .join(", ")}${set.length > 5 ? ", …" : ""})`;
      out.push({
        file: primary.file.path,
        severity: "MEDIUM",
        range: { startLine: primaryBlocks[0]?.startLine ?? 1, endLine: primaryBlocks.at(-1)?.endLine ?? 1 },
        relatedLocations: shared
          .flatMap((entries) => entries.filter((e) => e.fc !== primary))
          .slice(0, 50)
          .map((e) => ({ file: e.fc.file.path, startLine: e.block.startLine, endLine: e.block.endLine })),
        description: `${shared.length} block(s) are duplicated ${where}.`,
        evidence: evidence(primaryBlocks[0]?.text ?? ""),
        estimatedSavings: s,
        risk: "Copies drift apart over time, and agents that load both files pay for the same text twice.",
        recommendation: claudeAgents
          ? "Keep shared instructions in AGENTS.md and import it from CLAUDE.md with a line containing `@AGENTS.md` (Claude Code supports @path imports; when both files exist it reads only CLAUDE.md). Keep Claude-specific notes in CLAUDE.md. Imports do not reduce Claude's context cost by themselves; they remove the maintenance duplication."
          : "Keep the shared text in one file and reference it from the other with an import mechanism the reading tool supports.",
        autoFixable: false,
        kind: "verified",
      });
    }
    return out;
  },
};

export const RED005: Rule = {
  id: "RED-005",
  category: "redundancy",
  defaultSeverity: "MEDIUM",
  description: "Duplicate examples (code blocks) within a file",
  method:
    'Hash of fenced code blocks. Auto-fixed when both copies are in the same section, or both sit under headings that say "example".',
  fixable: true,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      const dupSections = duplicateSections(fc).map((d) => d.dup);
      const seen = new Map<string, Block>();
      let n = 0;
      for (const b of fc.doc.blocks.filter((x) => x.kind === "code")) {
        if (insideAny(b, dupSections)) continue;
        const h = hashNorm(b.text);
        const first = seen.get(h);
        if (!first) {
          seen.set(h, b);
          continue;
        }
        const s1 = sectionOf(fc, first);
        const s2 = sectionOf(fc, b);
        const isExample = (s?: Section) => /\bexamples?\b/i.test(s?.heading.text ?? "");
        // A repeated command inside different procedures may be deliberate; only examples or same-section repeats are auto-fixed.
        const autoFixable = s1 === s2 || (isExample(s1) && isExample(s2));
        // If the duplicate is the only content of its section, remove the whole (now empty) section.
        const onlyContent = s2 && s2 !== s1 && s2.body.length === 1;
        const start = onlyContent && s2 ? s2.startLine : b.startLine;
        const text = fc.doc.lines.slice(start - 1, b.endLine).join("\n");
        out.push({
          idKey: String(n++),
          severity: "MEDIUM",
          file: fc.file.path,
          range: { startLine: b.startLine, endLine: b.endLine },
          relatedLocations: [{ file: fc.file.path, startLine: first.startLine, endLine: first.endLine }],
          description: `Code example repeats ${lineRef(first.startLine, first.endLine)} exactly.`,
          evidence: evidence(b.text),
          estimatedSavings: await savings(ctx, text, "estimated", "high"),
          risk: autoFixable
            ? "Low: the identical example remains."
            : "Medium: the repeat is part of a different procedure.",
          recommendation: autoFixable
            ? "Remove the repeated example."
            : "Refer back to the first example instead of repeating it.",
          autoFixable,
          kind: "verified",
          ...(autoFixable ? { edits: [deleteEdit(fc, start, b.endLine, "RED-005", text)] } : {}),
        });
      }
    }
    return out;
  },
};
