import type { TokenCountResult } from "@tokenwise/shared";
import type { TokenizerAdapter } from "./types.ts";

/**
 * Provider-independent estimator. Heuristic, documented on the website (Concepts > Token counting):
 * - letter runs of up to 10 chars ≈ 1 token; longer runs ≈ ceil(len / 6)
 * - digit runs ≈ ceil(len / 3)
 * - CJK / kana / hangul characters ≈ 0.6 tokens each
 * - emoji and other astral symbols ≈ 2 tokens each; other punctuation/symbols ≈ 0.8
 * - single spaces are free (merged into the next word); longer whitespace runs ≈ (len - 1) / 4
 * Weights were fitted against o200k_base on tests/fixtures/corpus; the calibration test reports the error.
 */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff66-\uff9f]/u;

export const ESTIMATOR_WEIGHTS = {
  shortWord: 10,
  charsPerToken: 6,
  cjk: 0.6,
  astral: 2,
  punct: 0.8,
  whitespace: 4,
} as const;

export function estimateTokens(text: string): number {
  const W = ESTIMATOR_WEIGHTS;
  let tokens = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+|\s+|./gsu)) {
    const s = m[0];
    if (/^\s+$/.test(s)) {
      if (s.length >= 2) tokens += (s.length - 1) / W.whitespace;
      continue;
    }
    if (/^[\p{L}\p{N}\p{M}]+$/u.test(s)) {
      let letters = 0;
      let digits = 0;
      for (const ch of s) {
        if (CJK.test(ch)) tokens += W.cjk;
        else if (/\d/.test(ch)) digits++;
        else letters++;
      }
      tokens += Math.ceil(digits / 3);
      if (letters > 0) tokens += letters <= W.shortWord ? 1 : Math.ceil(letters / W.charsPerToken);
      continue;
    }
    tokens += (s.codePointAt(0) ?? 0) > 0xffff ? W.astral : W.punct;
  }
  return Math.round(tokens);
}

export class GenericEstimator implements TokenizerAdapter {
  readonly provider = "generic";

  supports(): boolean {
    return true;
  }

  async countTokens(input: { text: string; model?: string }): Promise<TokenCountResult> {
    const result: TokenCountResult = {
      inputTokens: estimateTokens(input.text),
      method: "estimated",
      encoding: "generic-estimator",
      scope: "text",
    };
    if (input.model) result.model = input.model;
    return result;
  }
}
