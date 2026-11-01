import { formatInt, normalizeWhitespace } from "@tokenwise/shared";
import type { Block } from "../document.ts";
import { contentBlocks, evidence, hashNorm } from "./helpers.ts";
import type { DraftFinding, FileContext, Rule } from "./types.ts";

export const CTX001: Rule = {
  id: "CTX-001",
  category: "context",
  defaultSeverity: "MEDIUM",
  description: "Always-loaded root instruction file over the token threshold",
  method:
    "Token count of a root CLAUDE.md, AGENTS.md or similar always-loaded file against thresholds.rootInstructionTokens (2000). HIGH at twice the threshold. Lists the largest sections as candidates to move on demand.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const limit = ctx.config.thresholds.rootInstructionTokens;
    for (const fc of ctx.files.filter((f) => f.alwaysLoaded && f.isRoot)) {
      const total = await ctx.counter.count(fc.file.file.text);
      if (total.inputTokens <= limit) continue;
      const sections = await Promise.all(
        fc.doc.sections.map(async (s) => ({
          s,
          tokens: await ctx.counter.tokens(fc.doc.lines.slice(s.startLine - 1, s.endLine).join("\n")),
        })),
      );
      const largest = sections.sort((a, b) => b.tokens - a.tokens).slice(0, 5);
      const movable = largest.reduce((n, x) => n + x.tokens, 0);
      const outline = largest
        .map(
          (x) =>
            `  - "${x.s.heading.text.replace(/^#+\s*/, "")}" (lines ${x.s.startLine}-${x.s.endLine}, ~${formatInt(x.tokens)} tokens)`,
        )
        .join("\n");
      out.push({
        idKey: "root-size",
        severity: total.inputTokens > 2 * limit ? "HIGH" : "MEDIUM",
        file: fc.file.path,
        range: { startLine: 1, endLine: fc.doc.lines.length },
        description: `${fc.file.path} is loaded into every session and has ${formatInt(total.inputTokens)} tokens (${total.method}); threshold is ${formatInt(limit)}.`,
        evidence: `${formatInt(total.inputTokens)} tokens, ${fc.doc.sections.length} sections`,
        estimatedSavings: { tokens: movable, basis: "potential", confidence: "low", method: total.method },
        risk: "Moving a section on demand means the agent only sees it when the trigger matches; anything needed on every task must stay.",
        recommendation: `Keep only rules every task needs. Move specialized sections to on-demand files — for Claude Code, path-scoped \`.claude/rules/*.md\` (with a \`paths\` field) or a skill; for Codex, a skill under \`.agents/skills/\` or a nested AGENTS.md. Largest sections:\n${outline}`,
        autoFixable: false,
        kind: "verified",
      });
    }
    return out;
  },
};

function blockType(b: Block): "log" | "data dump" | "table" | "code" {
  if (b.kind === "table") return "table";
  const lines = b.text.split("\n").slice(1, -1);
  const stamped = lines.filter((l) =>
    /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\b(?:ERROR|WARN|INFO|DEBUG)\b/.test(l),
  ).length;
  if (lines.length >= 5 && stamped / lines.length > 0.5) return "log";
  if (
    /^\s*(?:```|~~~)\s*(?:json|csv|xml|ya?ml)?\s*$/i.test(b.text.split("\n")[0] ?? "") &&
    /^[\s[{]/.test(lines[0] ?? "")
  )
    return "data dump";
  return "code";
}

export const CTX002: Rule = {
  id: "CTX-002",
  category: "context",
  defaultSeverity: "MEDIUM",
  description: "Large embedded block (log, data dump, long table) in an always-loaded file",
  method:
    "Log, data-dump and table blocks of at least thresholds.largeBlockTokens (400) in always-loaded files. Ordinary code examples are not reported.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const limit = ctx.config.thresholds.largeBlockTokens;
    for (const fc of ctx.files.filter((f) => f.alwaysLoaded)) {
      for (const b of fc.doc.blocks.filter((x) => x.kind === "code" || x.kind === "table")) {
        const r = await ctx.counter.count(b.text);
        if (r.inputTokens < limit) continue;
        const type = blockType(b);
        if (type === "code") continue; // ordinary code examples are handled by RED-005; size alone is not waste
        out.push({
          idKey: hashNorm(b.text),
          severity: "MEDIUM",
          file: fc.file.path,
          range: { startLine: b.startLine, endLine: b.endLine },
          description: `Embedded ${type} of ${formatInt(r.inputTokens)} tokens (${r.method}) in an always-loaded file.`,
          evidence: evidence(b.text),
          estimatedSavings: {
            tokens: r.inputTokens,
            basis: "potential",
            confidence: "medium",
            method: r.method,
          },
          risk: "If the agent needs this data for a task, it must be able to find it on demand.",
          recommendation:
            type === "table"
              ? "Move the table to a reference file and link to it; keep a one-line summary of what it contains."
              : `Move the ${type} to a separate file (e.g. docs/) and reference its path; summarize the lesson in one or two lines.`,
          autoFixable: false,
          kind: "verified",
        });
      }
    }
    return out;
  },
};

export const CTX003: Rule = {
  id: "CTX-003",
  category: "context",
  defaultSeverity: "MEDIUM",
  description: "Same background context repeated across agent/subagent definitions",
  method:
    "Paragraphs of 80+ characters repeated across subagent and prompt-template files. Skills are excluded because they load one at a time.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    // Skills load one at a time on demand, so only definitions that each start their own context count.
    const defs = ctx.files.filter(
      (f) => f.isProse && (f.file.category === "subagent" || f.file.category === "prompt-template"),
    );
    const index = new Map<string, { fc: FileContext; b: Block }[]>();
    for (const fc of defs) {
      for (const b of contentBlocks(fc)) {
        if (normalizeWhitespace(b.text).length < 80) continue;
        const h = hashNorm(b.text);
        const list = index.get(h) ?? [];
        if (!list.some((e) => e.fc === fc)) list.push({ fc, b });
        index.set(h, list);
      }
    }
    for (const entries of index.values()) {
      if (entries.length < 2) continue;
      const [first, ...rest] = entries;
      if (!first) continue;
      const r = await ctx.counter.count(first.b.text);
      out.push({
        file: first.fc.file.path,
        severity: "MEDIUM",
        range: { startLine: first.b.startLine, endLine: first.b.endLine },
        relatedLocations: rest.map((e) => ({
          file: e.fc.file.path,
          startLine: e.b.startLine,
          endLine: e.b.endLine,
        })),
        description: `Background paragraph repeated in ${entries.length} definitions: ${entries.map((e) => e.fc.file.path).join(", ")}.`,
        evidence: evidence(first.b.text),
        estimatedSavings: {
          tokens: r.inputTokens * (entries.length - 1),
          basis: "potential",
          confidence: "low",
          method: r.method,
        },
        risk: "Each subagent starts with its own context; removing shared background may leave one without facts it needs.",
        recommendation:
          "Put shared project background in the always-loaded instruction file (which subagents may already receive) or a shared reference, and keep only role-specific context in each definition. Verify what each subagent actually receives before removing it.",
        autoFixable: false,
        kind: "recommendation",
        confirmWith:
          "Check the harness docs for whether subagents inherit the root instruction file, or inspect a subagent transcript.",
      });
    }
    return out;
  },
};
