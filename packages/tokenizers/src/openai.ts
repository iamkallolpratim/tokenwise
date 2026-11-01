import type { TokenCountResult } from "@tokenwise/shared";
import { type OpenAIEncoding, openaiEncodingFor } from "./models.ts";
import type { TokenizerAdapter } from "./types.ts";

type CountFn = (text: string) => number;
const loaded = new Map<OpenAIEncoding, CountFn>();

async function loadEncoding(enc: OpenAIEncoding): Promise<CountFn> {
  const cached = loaded.get(enc);
  if (cached) return cached;
  let mod: { countTokens: CountFn };
  switch (enc) {
    case "o200k_base":
      mod = await import("gpt-tokenizer/encoding/o200k_base");
      break;
    case "o200k_harmony":
      mod = await import("gpt-tokenizer/encoding/o200k_harmony");
      break;
    case "cl100k_base":
      mod = await import("gpt-tokenizer/encoding/cl100k_base");
      break;
  }
  // Special-token strings in user files are counted as ordinary text, matching how they are sent.
  const fn: CountFn = (text) => mod.countTokens(text);
  loaded.set(enc, fn);
  return fn;
}

/** Count with a named encoding directly (used for estimator calibration). */
export async function countWithEncoding(enc: OpenAIEncoding, text: string): Promise<number> {
  return (await loadEncoding(enc))(text);
}

export class OpenAITokenizer implements TokenizerAdapter {
  readonly provider = "openai";

  supports(model: string): boolean {
    return openaiEncodingFor(model) !== undefined;
  }

  async countTokens(input: { text: string; model?: string }): Promise<TokenCountResult> {
    const model = input.model;
    const enc = model ? openaiEncodingFor(model) : undefined;
    if (!model || !enc) throw new Error(`OpenAI tokenizer does not support model "${model ?? "(none)"}"`);
    const count = await loadEncoding(enc);
    return { inputTokens: count(input.text), method: "exact", model, encoding: enc, scope: "text" };
  }
}
