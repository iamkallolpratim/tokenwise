import type { FileCategory } from "@tokenwise/shared";
import YAML from "yaml";

export interface Classification {
  category: FileCategory;
  reasons: string[];
}

const INSTRUCTION_BASENAMES = new Set([
  "claude.md",
  "claude.local.md",
  "agents.md",
  "agents.override.md",
  "gemini.md",
  "system.md",
  ".cursorrules",
  "copilot-instructions.md",
]);

/** Files that are never prompts by themselves, whatever their content. */
const NEVER_PROMPT = [
  /(^|\/)readme(\.[a-z]+)?$/i,
  /(^|\/)changelog(\.[a-z]+)?$/i,
  /(^|\/)contributing(\.[a-z]+)?$/i,
  /(^|\/)license(\.[a-z]+)?$/i,
  /(^|\/)code_of_conduct(\.[a-z]+)?$/i,
  /(^|\/)security\.md$/i,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)(pnpm-lock|yarn\.lock)/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)(biome|\.eslintrc|\.prettierrc)[^/]*$/,
  /(^|\/)\.github\/workflows\//,
  /(^|\/)tokenwise\.config\.json$/,
];

const MODEL_ADDRESS =
  /^\s*(?:[-*]\s+)?(?:you are\b|you must\b|you should\b|you will\b|your (?:task|role|job|goal) is\b|always\b|never\b|do not\b|don't\b|only\b|must\b|respond\b|answer\b|when the user\b)/i;

/** Counts lines addressed to a model in second person / imperative form. */
export function modelAddressSignals(text: string): number {
  let n = 0;
  for (const line of text.split(/\r?\n/)) if (MODEL_ADDRESS.test(line)) n++;
  return n;
}

const TOOL_KEYS = ["input_schema", "inputSchema", "parameters", "function", "functions", "tools"];
const RAG_KEYS = [
  "top_k",
  "topK",
  "chunk_size",
  "chunkSize",
  "chunk_overlap",
  "chunkOverlap",
  "retriever",
  "vector_store",
  "vectorStore",
  "rerank",
  "reranker",
  "similarity_top_k",
];
const AGENT_KEYS = [
  "system",
  "system_prompt",
  "systemPrompt",
  "instructions",
  "agents",
  "max_iterations",
  "maxIterations",
  "max_turns",
  "maxTurns",
  "model",
  "mcpServers",
  "permissions",
  "hooks",
];

function collectKeys(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value.slice(0, 50)) collectKeys(v, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    out.add(k);
    collectKeys(v, out, depth + 1);
  }
}

export function parseStructured(repoPath: string, text: string): unknown {
  try {
    if (/\.json$/i.test(repoPath)) return JSON.parse(text);
    if (/\.ya?ml$/i.test(repoPath)) return YAML.parse(text);
  } catch {
    return undefined;
  }
  return undefined;
}

function structuredCategory(data: unknown): Classification | null {
  const keys = new Set<string>();
  collectKeys(data, keys);
  const tool = TOOL_KEYS.filter((k) => keys.has(k));
  const hasToolShape =
    keys.has("input_schema") ||
    keys.has("inputSchema") ||
    (keys.has("parameters") && keys.has("name") && keys.has("description"));
  if (hasToolShape) return { category: "tool-schema", reasons: [`structured keys: ${tool.join(", ")}`] };
  const rag = RAG_KEYS.filter((k) => keys.has(k));
  if (rag.length >= 1) return { category: "rag-config", reasons: [`retrieval keys: ${rag.join(", ")}`] };
  const agent = AGENT_KEYS.filter((k) => keys.has(k));
  if (agent.length >= 2) return { category: "agent-config", reasons: [`agent keys: ${agent.join(", ")}`] };
  return null;
}

/**
 * Classifies a file as AI-relevant (or not) from path signals plus content signals.
 * Strong path signals suffice; weak name signals (*prompt*, *system*, *agent*) need content evidence.
 */
export function classify(repoPath: string, text: string): Classification | null {
  const lower = repoPath.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  const isStructured = /\.(json|ya?ml)$/.test(lower);
  if (NEVER_PROMPT.some((re) => re.test(repoPath))) return null;

  if (base === "skill.md") return { category: "skill", reasons: ["path: SKILL.md"] };
  if (INSTRUCTION_BASENAMES.has(base)) return { category: "agent-instructions", reasons: [`path: ${base}`] };

  const inClaude = /(^|\/)\.claude\//.test(lower);
  const inAgentsDir = /(^|\/)\.(agents|codex)\//.test(lower);
  if (inClaude || inAgentsDir) {
    const where = inClaude ? ".claude/" : ".agents/ or .codex/";
    if (/\/agents\/[^/]+\.md$/.test(lower))
      return { category: "subagent", reasons: [`path: ${where}agents/`] };
    if (/\/commands\/.+\.md$/.test(lower))
      return { category: "prompt-template", reasons: [`path: ${where}commands/`] };
    if (/\/(skills)\/.+\/(references?|examples?)\//.test(lower))
      return { category: "skill", reasons: [`path: ${where}skill reference`] };
    if (isStructured) {
      const s = structuredCategory(parseStructured(repoPath, text));
      return s
        ? { category: s.category, reasons: [`path: ${where}`, ...s.reasons] }
        : { category: "agent-config", reasons: [`path: ${where}`] };
    }
    return { category: "agent-instructions", reasons: [`path: ${where}`] };
  }
  if (/(^|\/)skills\/[^/]+\/(references?|examples?)\/[^/]+\.md$/.test(lower)) {
    return { category: "skill", reasons: ["path: skill reference file"] };
  }
  if (base === ".mcp.json" || base === "mcp.json")
    return { category: "agent-config", reasons: [`path: ${base}`] };

  if (/(^|\/)prompts?\//.test(lower)) {
    if (isStructured) {
      const s = structuredCategory(parseStructured(repoPath, text));
      return {
        category: s?.category ?? "prompt-template",
        reasons: ["path: prompts/", ...(s?.reasons ?? [])],
      };
    }
    return { category: "prompt-template", reasons: ["path: prompts/"] };
  }

  if (isStructured) {
    const s = structuredCategory(parseStructured(repoPath, text));
    if (s) return s;
    return null;
  }

  const signals = modelAddressSignals(text);
  const youAre = /\byou are (?:a|an|the)\b/i.test(text);
  const nameSignal = /prompt|system|agent|instruction/.exec(base)?.[0];
  if (nameSignal && signals >= 2) {
    const category: FileCategory = nameSignal === "agent" ? "subagent" : "prompt-template";
    return { category, reasons: [`name contains "${nameSignal}"`, `${signals} model-addressed lines`] };
  }
  if (youAre && signals >= 4) {
    return {
      category: "other-relevant",
      reasons: ['content: "You are a…" role statement', `${signals} model-addressed lines`],
    };
  }
  return null;
}

/** Files loaded into every session by an agent harness (vs. on demand). */
export function isAlwaysLoaded(repoPath: string): boolean {
  const base = (repoPath.split("/").pop() ?? "").toLowerCase();
  return INSTRUCTION_BASENAMES.has(base);
}
