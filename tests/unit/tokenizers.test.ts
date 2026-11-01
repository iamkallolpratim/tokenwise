import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  AnthropicApiCounter,
  countWithEncoding,
  estimateTokens,
  openaiEncodingFor,
  TokenizerRegistry,
} from "@tokenwise/tokenizers";
import { describe, expect, it, vi } from "vitest";
import { REPO_ROOT } from "../helpers/cli.ts";

describe("OpenAI model mapping", () => {
  it.each([
    ["gpt-5", "o200k_base"],
    ["gpt-5-mini", "o200k_base"],
    ["gpt-4o-2024-08-06", "o200k_base"],
    ["gpt-4.1", "o200k_base"],
    ["o3-mini", "o200k_base"],
    ["o1", "o200k_base"],
    ["gpt-4", "cl100k_base"],
    ["gpt-3.5-turbo-0125", "cl100k_base"],
    ["gpt-oss-120b", "o200k_harmony"],
  ])("%s → %s", (model, enc) => {
    expect(openaiEncodingFor(model)).toBe(enc);
  });

  it("does not claim unknown models", () => {
    expect(openaiEncodingFor("llama-3")).toBeUndefined();
    expect(openaiEncodingFor("claude-opus-5-5")).toBeUndefined();
  });
});

describe("TokenizerRegistry", () => {
  const reg = new TokenizerRegistry();

  it("counts OpenAI models exactly", async () => {
    const r = await reg.count("Hello, world!", "gpt-5");
    expect(r).toMatchObject({ method: "exact", encoding: "o200k_base", scope: "text", model: "gpt-5" });
    expect(r.inputTokens).toBe(4);
  });

  it("labels Claude models as estimated with a warning", async () => {
    const r = await reg.count("Hello, world!", "claude-opus-5-5");
    expect(r.method).toBe("estimated");
    expect(r.warnings?.join(" ")).toMatch(/no official offline tokenizer/i);
  });

  it("falls back to the generic estimator for unknown models and names the fallback", async () => {
    const r = await reg.count("Hello", "mystery-model");
    expect(r.method).toBe("estimated");
    expect(r.warnings?.join(" ")).toMatch(/Unknown model "mystery-model".*generic estimator/);
  });

  it("warns when no model is selected", async () => {
    const r = await reg.count("Hello", undefined);
    expect(r.method).toBe("estimated");
    expect(r.warnings?.join(" ")).toMatch(/No model selected/);
  });
});

describe("AnthropicApiCounter", () => {
  it("posts to count_tokens and labels provider_api", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ input_tokens: 14 }), { status: 200 }));
    const c = new AnthropicApiCounter("k", fetchMock as unknown as typeof fetch);
    const r = await c.countTokens({ text: "hi", model: "claude-opus-5-5" });
    expect(r).toMatchObject({ inputTokens: 14, method: "provider_api", scope: "full_request" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages/count_tokens");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("does not leak content or key on failure", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    const c = new AnthropicApiCounter("secret-key", fetchMock as unknown as typeof fetch);
    await expect(c.countTokens({ text: "private text", model: "claude-opus-5-5" })).rejects.toThrow(
      /^Anthropic count_tokens failed with HTTP 401$/,
    );
  });
});

describe("generic estimator calibration (vs o200k_base)", () => {
  const dir = path.join(REPO_ROOT, "tests", "fixtures", "corpus");
  const files = readdirSync(dir);

  it.each(files)("%s is within ±15% of o200k_base", async (f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    const exact = await countWithEncoding("o200k_base", text);
    const est = estimateTokens(text);
    const err = (est - exact) / exact;
    // Observed error is reported on the website (Concepts > Token counting); the bound here guards regressions.
    expect(Math.abs(err)).toBeLessThan(0.15);
  });

  it("is zero for empty text and monotonic in length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("word ".repeat(100))).toBeGreaterThan(estimateTokens("word ".repeat(10)));
  });
});
