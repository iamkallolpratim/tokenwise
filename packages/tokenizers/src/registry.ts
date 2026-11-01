import type { TokenCountResult } from "@tokenwise/shared";
import { AnthropicLocalEstimator } from "./anthropic.ts";
import { GenericEstimator } from "./generic.ts";
import { OpenAITokenizer } from "./openai.ts";
import type { TokenizerAdapter } from "./types.ts";

/**
 * Resolves a model to an adapter. Adapters are tried in registration order; the generic
 * estimator is the fallback and always adds a warning naming itself.
 */
export class TokenizerRegistry {
  private readonly adapters: TokenizerAdapter[] = [];
  private readonly fallback = new GenericEstimator();

  constructor(adapters?: TokenizerAdapter[]) {
    for (const a of adapters ?? [new OpenAITokenizer(), new AnthropicLocalEstimator()]) this.register(a);
  }

  /** Later registrations take precedence (e.g. a provider_api adapter over the local estimator). */
  register(adapter: TokenizerAdapter): void {
    this.adapters.unshift(adapter);
  }

  resolve(model: string | undefined): TokenizerAdapter {
    if (!model) return this.fallback;
    return this.adapters.find((a) => a.supports(model)) ?? this.fallback;
  }

  async count(text: string, model: string | undefined): Promise<TokenCountResult> {
    const adapter = this.resolve(model);
    const result = await adapter.countTokens(model ? { text, model } : { text });
    if (adapter === this.fallback) {
      const why = model
        ? `Unknown model "${model}"; using generic estimator (method: estimated).`
        : "No model selected; using generic estimator (method: estimated). Set defaultModel or pass --model.";
      result.warnings = [...(result.warnings ?? []), why];
    }
    return result;
  }
}
