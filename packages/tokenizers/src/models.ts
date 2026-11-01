/**
 * Model ID → tokenizer data. Kept as data, not conditionals (provenance: website docs, Project > Sources).
 * Exact names are checked first, then prefixes in order.
 */
export type OpenAIEncoding = "o200k_base" | "o200k_harmony" | "cl100k_base";

export const OPENAI_EXACT: Readonly<Record<string, OpenAIEncoding>> = {
  "gpt-5": "o200k_base",
  "gpt-4.1": "o200k_base",
  "gpt-4o": "o200k_base",
  "gpt-4": "cl100k_base",
  "gpt-3.5-turbo": "cl100k_base",
  "gpt-3.5": "cl100k_base",
  "gpt-35-turbo": "cl100k_base",
};

export const OPENAI_PREFIXES: ReadonlyArray<readonly [string, OpenAIEncoding]> = [
  ["o1-", "o200k_base"],
  ["o3-", "o200k_base"],
  ["o4-mini-", "o200k_base"],
  ["gpt-5", "o200k_base"],
  ["gpt-4.5-", "o200k_base"],
  ["gpt-4.1-", "o200k_base"],
  ["chatgpt-4o-", "o200k_base"],
  ["gpt-4o-", "o200k_base"],
  ["gpt-4-", "cl100k_base"],
  ["gpt-3.5-turbo-", "cl100k_base"],
  ["gpt-35-turbo-", "cl100k_base"],
  ["gpt-oss-", "o200k_harmony"],
  ["ft:gpt-4o", "o200k_base"],
  ["ft:gpt-4", "cl100k_base"],
  ["ft:gpt-3.5-turbo", "cl100k_base"],
];

/** Bare o-series names listed in tiktoken without a trailing dash. */
const OPENAI_O_SERIES = new Set(["o1", "o3", "o4-mini"]);

export function openaiEncodingFor(model: string): OpenAIEncoding | undefined {
  const exact = OPENAI_EXACT[model];
  if (exact) return exact;
  if (OPENAI_O_SERIES.has(model)) return "o200k_base";
  for (const [prefix, enc] of OPENAI_PREFIXES) if (model.startsWith(prefix)) return enc;
  return undefined;
}

/** Anthropic model IDs. No offline tokenizer exists for these; counts are estimated locally. */
export const ANTHROPIC_MODEL_PREFIXES: readonly string[] = ["claude-"];
