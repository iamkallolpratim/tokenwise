import type { TokenCountResult } from "@tokenwise/shared";

export interface TokenizerAdapter {
  readonly provider: string;
  supports(model: string): boolean;
  countTokens(input: { text: string; model?: string }): Promise<TokenCountResult>;
}
