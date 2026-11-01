import { formatInt, normalizeWhitespace } from "@tokenwise/shared";
import { evidence } from "./helpers.ts";
import { valueLine, walk } from "./structured.ts";
import type { DraftFinding, FileContext, Rule, RuleContext } from "./types.ts";

export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  raw: Record<string, unknown>;
  required: string[];
  line: number;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Extracts tool definitions in Anthropic (`input_schema`), MCP (`inputSchema`) and OpenAI (`function.parameters`) shapes. */
export function extractTools(fc: FileContext): ToolDef[] {
  const out: ToolDef[] = [];
  const seen = new Set<unknown>();
  const consider = (o: Record<string, unknown>) => {
    const fn = isObj(o.function) ? o.function : o;
    const schema = fn.input_schema ?? fn.inputSchema ?? fn.parameters;
    if (typeof fn.name !== "string" || !isObj(schema) || seen.has(fn)) return;
    seen.add(fn);
    const required = Array.isArray(schema.required)
      ? schema.required.filter((x): x is string => typeof x === "string")
      : [];
    out.push({
      name: fn.name,
      description: typeof fn.description === "string" ? fn.description : "",
      schema,
      raw: o,
      required,
      line: valueLine(fc.file.file.text, fn.name),
    });
  };
  if (isObj(fc.structured)) consider(fc.structured);
  walk(fc.structured, ({ value }) => {
    if (Array.isArray(value)) {
      for (const v of value) if (isObj(v)) consider(v);
    } else if (isObj(value)) {
      consider(value);
    }
  });
  return out;
}

function toolFiles(ctx: RuleContext): FileContext[] {
  return ctx.files.filter(
    (f) => !f.isProse && (f.file.category === "tool-schema" || f.file.category === "agent-config"),
  );
}

export const TOOL001: Rule = {
  id: "TOOL-001",
  category: "tool",
  defaultSeverity: "MEDIUM",
  description: "Oversized tool definition",
  method: "Token count of one tool definition against thresholds.toolSchemaTokens (300).",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const limit = ctx.config.thresholds.toolSchemaTokens;
    for (const fc of toolFiles(ctx)) {
      for (const t of extractTools(fc)) {
        const total = await ctx.counter.count(JSON.stringify(t.raw));
        if (total.inputTokens <= limit) continue;
        const desc = await ctx.counter.count(t.description);
        out.push({
          idKey: t.name,
          severity: "MEDIUM",
          file: fc.file.path,
          range: { startLine: t.line, endLine: t.line },
          description: `Tool "${t.name}" definition is ${formatInt(total.inputTokens)} tokens (${total.method}); threshold ${formatInt(limit)}. Its description alone is ${formatInt(desc.inputTokens)}.`,
          evidence: evidence(t.description),
          estimatedSavings: {
            tokens: Math.max(0, total.inputTokens - limit),
            basis: "potential",
            confidence: "low",
            method: total.method,
          },
          risk: "Tool definitions are sent with every request that offers the tool; trimming the wrong detail makes the model call it wrongly.",
          recommendation:
            "Keep the description to what the model needs to choose and call the tool; move worked examples and background to documentation. Do not remove required parameters" +
            (t.required.length ? ` (${t.required.join(", ")})` : "") +
            ".",
          autoFixable: false,
          kind: "verified",
          confirmWith: "Run a tool-selection eval before and after trimming.",
        });
      }
    }
    return out;
  },
};

export const TOOL002: Rule = {
  id: "TOOL-002",
  category: "tool",
  defaultSeverity: "LOW",
  description: "Description text duplicated across tools or parameters",
  method: "Sentences or parameter descriptions repeated across tools in one file.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of toolFiles(ctx)) {
      const occurrences = new Map<string, { where: string; line: number }[]>();
      const note = (sentence: string, where: string, line: number) => {
        const s = normalizeWhitespace(sentence);
        if (s.length < 30) return;
        const list = occurrences.get(s) ?? [];
        list.push({ where, line });
        occurrences.set(s, list);
      };
      for (const t of extractTools(fc)) {
        for (const s of t.description.split(/(?<=[.!?])\s+/)) note(s, `tool ${t.name}`, t.line);
        const props = t.schema.properties;
        if (props && typeof props === "object") {
          for (const [p, def] of Object.entries(props as Record<string, unknown>)) {
            const d = (def as { description?: unknown })?.description;
            if (typeof d === "string")
              note(d, `${t.name}.${p}${t.required.includes(p) ? " (required)" : ""}`, t.line);
          }
        }
      }
      for (const [text, hits] of occurrences) {
        if (hits.length < 2) continue;
        const r = await ctx.counter.count(text);
        const where = hits.map((h) => h.where);
        const line = hits[0]?.line ?? 1;
        out.push({
          idKey: text,
          severity: "LOW",
          file: fc.file.path,
          range: { startLine: line, endLine: line },
          description: `Same description text appears ${where.length} times: ${where.join(", ")}.`,
          evidence: evidence(text),
          estimatedSavings: {
            tokens: r.inputTokens * (where.length - 1),
            basis: "potential",
            confidence: "medium",
            method: r.method,
          },
          risk: "Copied descriptions are easy to misapply (check each one still describes its parameter). Required parameters must stay.",
          recommendation:
            "Write each description for its own tool or parameter; state shared conventions once (e.g. in the tool most often called) instead of repeating them. Keep every parameter.",
          autoFixable: false,
          kind: "verified",
        });
      }
    }
    return out;
  },
};

const EXAMPLE = /\b(?:for example|example|e\.g\.)\b[:,]?/i;

export const TOOL003: Rule = {
  id: "TOOL-003",
  category: "tool",
  defaultSeverity: "MEDIUM",
  description: "Long inline examples in a tool description",
  method: "Example text with JSON of 60+ tokens inside a tool description.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const fc of toolFiles(ctx)) {
      for (const t of extractTools(fc)) {
        const m = EXAMPLE.exec(t.description);
        if (!m) continue;
        const exampleText = t.description.slice(m.index);
        const r = await ctx.counter.count(exampleText);
        const examples = (t.description.match(new RegExp(EXAMPLE.source, "gi")) ?? []).length;
        if (r.inputTokens < 60 || !/[{[]/.test(exampleText)) continue;
        out.push({
          idKey: t.name,
          severity: "MEDIUM",
          file: fc.file.path,
          range: { startLine: t.line, endLine: t.line },
          description: `Tool "${t.name}" description carries ${examples} inline example(s) (~${formatInt(r.inputTokens)} tokens, ${r.method}).`,
          evidence: evidence(exampleText),
          estimatedSavings: {
            tokens: Math.round(r.inputTokens * 0.7),
            basis: "potential",
            confidence: "low",
            method: r.method,
          },
          risk: "Examples can teach argument formats; keep one minimal example if calls fail without it.",
          recommendation:
            "Keep at most one short example of the arguments; the input schema already defines the shape. Move response samples to documentation.",
          autoFixable: false,
          kind: "recommendation",
          confirmWith: "Compare tool-call accuracy with and without the examples in an eval suite.",
        });
      }
    }
    return out;
  },
};

export const TOOL004: Rule = {
  id: "TOOL-004",
  category: "tool",
  defaultSeverity: "MEDIUM",
  description: "Large tool set that could be loaded on demand",
  method: "More than thresholds.toolCount (20) tools defined in one file.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    const limit = ctx.config.thresholds.toolCount;
    for (const fc of toolFiles(ctx)) {
      const tools = extractTools(fc);
      if (tools.length <= limit) continue;
      const total = await ctx.counter.count(fc.file.file.text);
      out.push({
        severity: "MEDIUM",
        file: fc.file.path,
        range: { startLine: 1, endLine: 1 },
        description: `${tools.length} tools are defined together (threshold ${limit}); together they are ${formatInt(total.inputTokens)} tokens (${total.method}).`,
        evidence: tools
          .slice(0, 8)
          .map((t) => t.name)
          .join(", "),
        estimatedSavings: {
          tokens: total.inputTokens,
          basis: "potential",
          confidence: "low",
          method: total.method,
        },
        risk: "If a tool is not loaded, the model cannot call it; group tools by task so the right group is present.",
        recommendation:
          "Group tools by task and offer only the group a request needs (tool search or on-demand loading, where the harness supports it).",
        autoFixable: false,
        kind: "recommendation",
        confirmWith: "Import usage logs to see which tools are actually called per task.",
      });
    }
    return out;
  },
};
