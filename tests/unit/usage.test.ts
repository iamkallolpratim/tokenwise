import path from "node:path";
import {
  computeScore,
  computeUsageStats,
  ingestUsageFile,
  MIN_FOLLOW_UPS,
  mergeUsage,
  parseUsageLine,
  parseUsageObject,
  type UsageRecord,
} from "@tokenwise/core";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../helpers/cli.ts";

const FIX = path.join(REPO_ROOT, "tests", "fixtures", "usage");

describe("parseUsageObject", () => {
  it("Anthropic: input_tokens excludes cache reads and writes", () => {
    expect(
      parseUsageObject({
        input_tokens: 50,
        cache_read_input_tokens: 100000,
        cache_creation_input_tokens: 0,
        output_tokens: 7,
      }),
    ).toEqual({ uncachedInput: 50, cacheRead: 100000, cacheWrite: 0, output: 7, format: "anthropic" });
  });

  it("OpenAI Responses: cached and cache-write tokens are subsets of input_tokens", () => {
    expect(
      parseUsageObject({
        input_tokens: 12000,
        output_tokens: 1,
        input_tokens_details: { cached_tokens: 4000, cache_write_tokens: 7000 },
      }),
    ).toEqual({
      uncachedInput: 1000,
      cacheRead: 4000,
      cacheWrite: 7000,
      output: 1,
      format: "openai-responses",
    });
  });

  it("OpenAI Chat Completions: cached_tokens is a subset of prompt_tokens", () => {
    expect(
      parseUsageObject({
        prompt_tokens: 6000,
        completion_tokens: 2,
        prompt_tokens_details: { cached_tokens: 4864 },
      }),
    ).toEqual({ uncachedInput: 1136, cacheRead: 4864, cacheWrite: 0, output: 2, format: "openai-chat" });
  });

  it("rejects negative, fractional and inconsistent counts", () => {
    expect(parseUsageObject({ input_tokens: -1, output_tokens: 0 })).toBeNull();
    expect(parseUsageObject({ input_tokens: 1.5, output_tokens: 0 })).toBeNull();
    expect(
      parseUsageObject({
        prompt_tokens: 10,
        completion_tokens: 0,
        prompt_tokens_details: { cached_tokens: 11 },
      }),
    ).toBeNull();
    expect(parseUsageObject({ output_tokens: 3 })).toBeNull();
  });
});

describe("parseUsageLine", () => {
  it("keeps only numbers, model and timestamp; ids are hashed", () => {
    const r = parseUsageLine(
      JSON.stringify({
        session_id: "conv-secret-id",
        request: { messages: [{ role: "user", content: "PRIVATE" }] },
        response: { id: "chatcmpl-9", model: "gpt-5", usage: { prompt_tokens: 3, completion_tokens: 4 } },
      }),
    );
    expect(r.kind).toBe("record");
    const s = JSON.stringify(r);
    expect(s).not.toContain("PRIVATE");
    expect(s).not.toContain("conv-secret-id");
    expect(s).not.toContain("chatcmpl-9");
  });

  it("classifies blank, non-usage and malformed lines", () => {
    expect(parseUsageLine("").kind).toBe("ignored");
    expect(parseUsageLine('{"object":"list"}').kind).toBe("ignored");
    expect(parseUsageLine("{nope").kind).toBe("invalid");
    expect(parseUsageLine("[1,2]").kind).toBe("invalid");
  });
});

describe("ingestUsageFile", () => {
  it("reads a Claude Code transcript: dedupes repeated content-block lines, skips synthetic and non-assistant lines", async () => {
    const r = await ingestUsageFile(path.join(FIX, "claude-code.jsonl"));
    expect(r.records).toHaveLength(5);
    expect(r.duplicates).toBe(1);
    expect(r.ignored).toBe(3);
    expect(r.invalid).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE-/);
    const stats = computeUsageStats(r.records);
    // The sidechain (subagent) request is its own session, so the main session has 3 follow-ups.
    expect(stats.sessions).toBe(2);
    expect(stats.followUps).toBe(3);
    expect(stats.followUpCacheShare).toBeCloseTo(28400 / 29690, 6);
    expect(stats.models).toEqual(["claude-haiku-5-5", "claude-opus-5-5"]);
  });

  it("reads OpenAI request/response logs", async () => {
    const r = await ingestUsageFile(path.join(FIX, "openai.jsonl"));
    expect(r.records).toHaveLength(3);
    expect(r.invalid).toBe(1);
    expect(r.ignored).toBe(1);
    const stats = computeUsageStats(r.records);
    expect(stats.totalInput).toBe(5000 + 6000 + 12000);
    expect(stats.cacheRead).toBe(4864 + 4000);
    expect(stats.followUps).toBe(1);
    expect(stats.firstTimestamp).toBe(new Date(1793354400 * 1000).toISOString());
  });
});

describe("mergeUsage", () => {
  it("re-importing the same file adds nothing", async () => {
    const r = await ingestUsageFile(path.join(FIX, "claude-code.jsonl"));
    const first = mergeUsage(null, [r], "t1");
    const second = mergeUsage(first.store, [r], "t2");
    expect(first.added).toBe(5);
    expect(second.added).toBe(0);
    expect(second.store.records).toHaveLength(5);
    expect(second.store.sources).toHaveLength(2);
  });
});

describe("agent-loop score from usage", () => {
  const rec = (session: string, ts: string, read: number, uncached: number): UsageRecord => ({
    key: `${session}-${ts}`,
    session,
    model: "m",
    timestamp: ts,
    uncachedInput: uncached,
    cacheRead: read,
    cacheWrite: 0,
    output: 1,
    format: "anthropic",
  });
  const base = { files: [], findings: [], tokens: new Map<string, number>(), rootInstructionTokens: 2000 };

  it("scores cache share on follow-up requests", () => {
    const records = ["1", "2", "3", "4"].map((t) => rec("s", t, 400, 600));
    const s = computeScore({ ...base, usage: computeUsageStats(records) });
    const d = s.dimensions.find((x) => x.key === "agentLoop");
    // 40% cache share / 0.8 target = 50.
    expect(d?.score).toBe(50);
    expect(d?.explanation).toMatch(/provider-reported usage/);
    expect(s.score).toBe(50);
  });

  it(`stays n/a below ${MIN_FOLLOW_UPS} follow-up requests or without usage`, () => {
    const few = computeUsageStats([rec("s", "1", 0, 10), rec("s", "2", 0, 10)]);
    expect(
      computeScore({ ...base, usage: few }).dimensions.find((x) => x.key === "agentLoop")?.score,
    ).toBeNull();
    const none = computeScore(base).dimensions.find((x) => x.key === "agentLoop");
    expect(none?.score).toBeNull();
    expect(none?.explanation).toMatch(/tokenwise ingest/);
  });
});
