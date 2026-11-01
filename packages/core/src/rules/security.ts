import { findSecrets } from "@tokenwise/shared";
import { protectedSentencesFor } from "./sentences.ts";
import type { DraftFinding, Rule } from "./types.ts";

export const SEC001: Rule = {
  id: "SEC-001",
  category: "security",
  defaultSeverity: "CRITICAL",
  description: "Secret-like string in a scanned file",
  method:
    "Known credential formats (Anthropic, OpenAI, AWS, GitHub, Slack, Google, Stripe, JWT, private keys, api_key assignments). Placeholders are skipped. The secret itself is never printed.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files) {
      const text = fc.file.file.text;
      const seen = new Map<string, number>();
      for (const m of findSecrets(text)) {
        seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
        const line = text.slice(0, m.index).split("\n").length;
        out.push({
          idKey: `${m.name}:${seen.get(m.name) ?? 0}`,
          severity: "CRITICAL",
          file: fc.file.path,
          range: { startLine: line, endLine: line },
          description: `Possible ${m.name} in a file that is sent to models.`,
          evidence: `[REDACTED:${m.name}] at line ${line}`,
          risk: "Anything in a prompt file is sent to the model provider and may appear in logs or outputs.",
          recommendation:
            "Remove the secret, rotate it, and load it at runtime from an environment variable or secret store.",
          autoFixable: false,
          kind: "verified",
        });
      }
    }
    return out;
  },
};

export const SEC002: Rule = {
  id: "SEC-002",
  category: "security",
  defaultSeverity: "CRITICAL",
  description: "Contradictory normative instructions (MUST X and MUST NOT X)",
  method:
    "A MUST / MUST NOT (also always / never) pair with identical normalized objects in the same file. Low confidence; cross-file pairs are not compared.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of ctx.files.filter((f) => f.isProse)) {
      const stmts = protectedSentencesFor(fc);
      const pos = new Map<string, (typeof stmts)[number]>();
      for (const s of stmts) if (s.polarity === "positive" && !pos.has(s.object)) pos.set(s.object, s);
      for (const s of stmts) {
        if (s.polarity !== "negative") continue;
        const p = pos.get(s.object);
        if (!p) continue;
        out.push({
          idKey: s.object,
          severity: "CRITICAL",
          file: fc.file.path,
          range: { startLine: s.line, endLine: s.line },
          relatedLocations: [{ file: fc.file.path, startLine: p.line, endLine: p.line }],
          description: `Contradiction: line ${p.line} requires "${p.text}" but line ${s.line} forbids it.`,
          evidence: `${p.text} ⟷ ${s.text}`,
          risk: "The model may follow either instruction. Low confidence: a qualifier elsewhere may resolve it.",
          recommendation:
            "Decide which rule applies and delete the other, or add the condition that separates them.",
          autoFixable: false,
          kind: "verified",
          confirmWith:
            "Read both lines in context; this rule matches only identical objects after normalization.",
        });
      }
    }
    return out;
  },
};
