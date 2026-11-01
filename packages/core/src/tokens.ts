import type { TokenCountResult } from "@tokenwise/shared";
import { TokenizerRegistry } from "@tokenwise/tokenizers";

/** Thin cache around the registry so a run counts each distinct text once per model. */
export class TokenCounter {
  private readonly cache = new Map<string, TokenCountResult>();

  readonly model: string | undefined;
  readonly registry: TokenizerRegistry;

  constructor(model: string | undefined, registry: TokenizerRegistry = new TokenizerRegistry()) {
    this.model = model;
    this.registry = registry;
  }

  async count(text: string): Promise<TokenCountResult> {
    const hit = this.cache.get(text);
    if (hit) return hit;
    const r = await this.registry.count(text, this.model);
    if (text.length < 20_000) this.cache.set(text, r);
    return r;
  }

  async tokens(text: string): Promise<number> {
    return (await this.count(text)).inputTokens;
  }

  /** Method label for anything this counter produces. */
  async method(): Promise<TokenCountResult["method"]> {
    return (await this.count("probe")).method;
  }
}
