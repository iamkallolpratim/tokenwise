/**
 * Static agent-loop checks for JS/TS/Python. Deliberately narrow: only infinite loop headers and
 * loops whose model-call arguments never change. Static analysis cannot measure runtime usage, so
 * every finding is a low-confidence recommendation.
 */
import { MODEL_CALL } from "../discovery.ts";
import { evidence } from "./helpers.ts";
import type { DraftFinding, Rule, RuleContext } from "./types.ts";

export interface LoopInfo {
  file: string;
  line: number;
  header: string;
  body: string;
  infinite: boolean;
  language: "js" | "py";
}

const JS_LOOP = /\b(?:while\s*\(([^)]*)\)|for\s*\(([^)]*)\)|do)\s*\{/g;
const PY_LOOP = /^([ \t]*)(?:while\s+(.+?)|for\s+.+?\s+in\s+.+?):\s*$/gm;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Brace-matched body starting at the `{` at `open`. Ignores braces in strings and comments approximately. */
function braceBody(text: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "/" && text[i + 1] === "/")
      i = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

function pyBody(text: string, headerEnd: number, indent: string): string {
  const lines = text.slice(headerEnd).split("\n").slice(1);
  const body: string[] = [];
  for (const l of lines) {
    if (l.trim() === "") {
      body.push(l);
      continue;
    }
    const ind = /^[ \t]*/.exec(l)?.[0] ?? "";
    if (ind.length <= indent.length) break;
    body.push(l);
  }
  return body.join("\n");
}

export function findLoops(path: string, text: string): LoopInfo[] {
  const out: LoopInfo[] = [];
  if (path.endsWith(".py")) {
    for (const m of text.matchAll(PY_LOOP)) {
      const cond = m[2]?.trim();
      out.push({
        file: path,
        line: lineOf(text, m.index ?? 0),
        header: m[0].trim(),
        body: pyBody(text, (m.index ?? 0) + m[0].length, m[1] ?? ""),
        infinite: cond === "True" || cond === "1",
        language: "py",
      });
    }
    return out;
  }
  for (const m of text.matchAll(JS_LOOP)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const whileCond = m[1]?.trim();
    const forHead = m[2]?.replace(/\s/g, "");
    out.push({
      file: path,
      line: lineOf(text, m.index ?? 0),
      header: m[0].replace(/\s*\{$/, "").trim(),
      body: braceBody(text, open),
      infinite: whileCond === "true" || whileCond === "1" || forHead === ";;" || m[0].startsWith("do"),
      language: "js",
    });
  }
  return out;
}

const CAP =
  /\b(?:max|limit|attempts?|iterations?|turns?|steps?|retries|tries)\w*\s*(?:[<>]=?|===?|!==?)|(?:[<>]=?|===?)\s*\w*(?:max|limit|attempts?|iterations?|turns?|steps?|retries|tries)/i;
const RETRY = /\b(?:catch|except)\b/;

function modelLoops(ctx: RuleContext): LoopInfo[] {
  return ctx.codeFiles.flatMap((f) => findLoops(f.path, f.text)).filter((l) => MODEL_CALL.test(l.body));
}

const common = {
  autoFixable: false,
  kind: "recommendation" as const,
  confirmWith:
    "Static analysis cannot measure runtime usage; import usage logs (tokenwise ingest) to confirm.",
};

export const LOOP001: Rule = {
  id: "LOOP-001",
  category: "agent-loop",
  defaultSeverity: "MEDIUM",
  description: "Model called in a loop with no iteration cap",
  method:
    "Static check of JS/TS/Python source: while(true), for(;;), do {} or while True: loops that call a model with no iteration cap. Regex-based, not a parser.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const l of modelLoops(ctx)) {
      if (!l.infinite || CAP.test(l.body) || RETRY.test(l.body)) continue;
      out.push({
        ...common,
        idKey: `${l.header}\u0000${l.body.replace(/\s+/g, " ").trim()}`,
        severity: "MEDIUM",
        file: l.file,
        range: { startLine: l.line, endLine: l.line },
        description: `\`${l.header}\` calls a model and stops only when the model says so; there is no iteration cap.`,
        evidence: evidence(l.header),
        risk: "A cap that is too low cuts off long tasks; pick it from observed turn counts.",
        recommendation: "Add a maximum number of turns and stop (or ask the user) when it is reached.",
      });
    }
    return out;
  },
};

export const LOOP002: Rule = {
  id: "LOOP-002",
  category: "agent-loop",
  defaultSeverity: "MEDIUM",
  description: "Model call retried with no maximum",
  method: "Static check: a retry loop around a model call with no maximum attempt count.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const l of modelLoops(ctx)) {
      if (!l.infinite || !RETRY.test(l.body) || CAP.test(l.body)) continue;
      out.push({
        ...common,
        idKey: `${l.header}\u0000${l.body.replace(/\s+/g, " ").trim()}`,
        severity: "MEDIUM",
        file: l.file,
        range: { startLine: l.line, endLine: l.line },
        description: `\`${l.header}\` retries a failed model call with no maximum.`,
        evidence: evidence(l.header),
        risk: "Without a cap, a persistent error (bad request, revoked key) repeats the full prompt indefinitely.",
        recommendation:
          "Retry a bounded number of times with backoff, and only for retryable errors (rate limits, timeouts).",
      });
    }
    return out;
  },
};

const IDENT = /\b[A-Za-z_$][\w$]*\b/g;
const KEYWORDS = new Set([
  "await",
  "const",
  "let",
  "var",
  "role",
  "content",
  "system",
  "messages",
  "user",
  "assistant",
  "true",
  "false",
  "null",
  "undefined",
  "new",
  "return",
  "model",
  "self",
]);

/** Arguments of the first model call in a loop body. */
function callArgs(body: string): string | null {
  const m = MODEL_CALL.exec(body);
  if (!m) return null;
  const start = body.indexOf("(", m.index);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")" && --depth === 0) return body.slice(start + 1, i);
  }
  return null;
}

export const LOOP003: Rule = {
  id: "LOOP-003",
  category: "agent-loop",
  defaultSeverity: "LOW",
  description: "Same prompt re-sent with unchanged context on every iteration",
  method:
    "Static check: a loop whose model-call arguments are never reassigned, so the same prompt and context are re-sent each iteration.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const l of modelLoops(ctx)) {
      if (l.infinite && RETRY.test(l.body)) continue; // a retry loop is LOOP-002's finding
      const args = callArgs(l.body);
      if (!args) continue;
      const strippedArgs = args.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
      const idents = [...new Set(strippedArgs.match(IDENT) ?? [])].filter(
        (i) => !KEYWORDS.has(i) && !/^\d/.test(i),
      );
      if (idents.length === 0) continue;
      const bodyWithoutCall = l.body.replace(args, "");
      const loopVar =
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+(?:of|in)\b/.exec(l.header)?.[1] ??
        /^for\s+(\w+)\s+in\b/.exec(l.header)?.[1];
      const changes = (id: string) =>
        id === loopVar ||
        new RegExp(
          `\\b${id}\\s*(?:[+\\-*/]?=(?!=)|\\.(?:push|append|extend|concat|unshift|splice)\\b|\\+\\+|--)`,
        ).test(bodyWithoutCall) ||
        new RegExp(`(?:const|let|var)\\s+${id}\\b`).test(bodyWithoutCall);
      if (idents.some(changes)) continue;
      out.push({
        ...common,
        idKey: `${l.header}\u0000${l.body.replace(/\s+/g, " ").trim()}`,
        severity: "LOW",
        file: l.file,
        range: { startLine: l.line, endLine: l.line },
        description: `Inside \`${l.header}\`, the model call's arguments (${idents.join(", ")}) do not change between iterations.`,
        evidence: evidence(args),
        risk: "The loop may be intentional (sampling several answers); check before hoisting the call.",
        recommendation:
          "Call once outside the loop and reuse the result, or include the per-iteration input in the prompt.",
      });
    }
    return out;
  },
};

export const CACHE001: Rule = {
  id: "CACHE-001",
  category: "context",
  defaultSeverity: "LOW",
  description: "Same constant system prompt sent from several call sites (prompt caching candidate)",
  method:
    "Static check: the same constant system prompt identifier sent from several call sites or from a loop. Separates provider prompt caching, semantic caching and application result caching in its recommendation.",
  fixable: false,
  async detect(ctx) {
    const out: DraftFinding[] = [];
    for (const f of ctx.codeFiles) {
      const uses = new Map<string, number[]>();
      for (const m of f.text.matchAll(/\bsystem\s*[:=]\s*([A-Z][A-Z0-9_]{2,})\b/g)) {
        const id = m[1] ?? "";
        uses.set(id, [...(uses.get(id) ?? []), lineOf(f.text, m.index ?? 0)]);
      }
      for (const [id, lines] of uses) {
        const inLoop = findLoops(f.path, f.text).some((l) => l.body.includes(id));
        if (lines.length < 2 && !inLoop) continue;
        out.push({
          ...common,
          idKey: id,
          severity: "LOW",
          file: f.path,
          range: { startLine: lines[0] ?? 1, endLine: lines[0] ?? 1 },
          description: `Constant system prompt ${id} is sent from ${lines.length} call site(s)${inLoop ? ", including inside a loop" : ""}.`,
          evidence: `${id} at lines ${lines.join(", ")}`,
          risk: "Prompt caching cuts the cost of reprocessing a repeated prefix; it does not shrink the context window. It only helps if the prefix is byte-identical and large enough for the provider to cache.",
          recommendation:
            "If the prefix is large, enable the provider's prompt caching for it. Separately consider application-level caching of results you recompute, and treat semantic response caching (reusing answers to similar questions) as a quality risk to evaluate.",
          confirmWith: "Check provider usage fields for cached input tokens before and after.",
        });
      }
    }
    return out;
  },
};
