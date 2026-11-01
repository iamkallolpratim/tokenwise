import type { TokenCountResult } from "@tokenwise/shared";
import { estimateTokens } from "./generic.ts";
import { ANTHROPIC_MODEL_PREFIXES } from "./models.ts";
import type { TokenizerAdapter } from "./types.ts";

export const ANTHROPIC_COUNT_TOKENS_URL = "https://api.anthropic.com/v1/messages/count_tokens";
export const ANTHROPIC_VERSION = "2023-06-01";

export function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

/** Offline Claude counting: there is no official offline tokenizer, so this is always an estimate. */
export class AnthropicLocalEstimator implements TokenizerAdapter {
  readonly provider = "anthropic";

  supports(model: string): boolean {
    return isAnthropicModel(model);
  }

  async countTokens(input: { text: string; model?: string }): Promise<TokenCountResult> {
    const result: TokenCountResult = {
      inputTokens: estimateTokens(input.text),
      method: "estimated",
      encoding: "generic-estimator",
      scope: "text",
      warnings: [
        "No official offline tokenizer exists for current Claude models; count is estimated. Use --allow-external for provider_api counts.",
      ],
    };
    if (input.model) result.model = input.model;
    return result;
  }
}

/**
 * Anthropic Messages token-counting API. Sends file content off the machine, so callers MUST
 * obtain I1 consent before constructing this adapter. The key comes only from the environment.
 */
export class AnthropicApiCounter implements TokenizerAdapter {
  readonly provider = "anthropic";

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  supports(model: string): boolean {
    return isAnthropicModel(model);
  }

  async countTokens(input: { text: string; model?: string }): Promise<TokenCountResult> {
    if (!input.model) throw new Error("Anthropic token counting requires a model");
    const res = await this.fetchImpl(ANTHROPIC_COUNT_TOKENS_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: input.model, messages: [{ role: "user", content: input.text || " " }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      // Never echo the request (it contains content) or headers (they contain the key).
      throw new Error(`Anthropic count_tokens failed with HTTP ${res.status}`);
    }
    const body = (await res.json()) as { input_tokens?: unknown };
    if (typeof body.input_tokens !== "number")
      throw new Error("Anthropic count_tokens returned no input_tokens");
    return {
      inputTokens: body.input_tokens,
      method: "provider_api",
      model: input.model,
      encoding: "anthropic-count_tokens",
      scope: "full_request",
      warnings: ["provider_api count includes message framing for a single user message."],
    };
  }
}
