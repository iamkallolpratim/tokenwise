import { createReadStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { shortHash, TokenwiseError } from "@tokenwise/shared";
import { z } from "zod";
import { writeFileAtomic } from "./fileio.ts";

/**
 * Usage-log ingest (Section 10, optional). Only numeric usage fields, the model id and the
 * timestamp are kept; message content is never stored or printed (I5). Session and request ids
 * are hashed. Field conventions are documented on the website (Project > Sources):
 * - Anthropic: input_tokens excludes cache reads/writes; total = input + cache_read + cache_creation.
 * - OpenAI Responses: input_tokens includes input_tokens_details.cached_tokens and cache_write_tokens.
 * - OpenAI Chat Completions: prompt_tokens with prompt_tokens_details.cached_tokens (same convention).
 */
export const UsageRecordSchema = z.object({
  key: z.string(),
  session: z.string().nullable(),
  model: z.string().nullable(),
  timestamp: z.string().nullable(),
  /** Input tokens neither read from nor written to a cache. */
  uncachedInput: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  format: z.enum(["claude-code", "anthropic", "openai-chat", "openai-responses"]),
});
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export const UsageStoreSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  sources: z.array(
    z.object({
      name: z.string(),
      importedAt: z.string(),
      records: z.number().int(),
      duplicates: z.number().int(),
      ignored: z.number().int(),
      invalid: z.number().int(),
    }),
  ),
  records: z.array(UsageRecordSchema),
});
export type UsageStore = z.infer<typeof UsageStoreSchema>;

export function defaultUsagePath(root: string): string {
  return path.join(root, ".tokenwise", "usage.json");
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
function count(v: unknown): number | null {
  if (v === undefined || v === null) return 0;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

interface ParsedUsage {
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  format: "anthropic" | "openai-chat" | "openai-responses";
}

/** Normalizes one provider usage object, or returns null when the numbers are missing or invalid. */
export function parseUsageObject(u: Obj): ParsedUsage | null {
  if ("prompt_tokens" in u) {
    const details = isObj(u.prompt_tokens_details) ? u.prompt_tokens_details : {};
    const prompt = count(u.prompt_tokens);
    const cached = count(details.cached_tokens);
    const output = count(u.completion_tokens);
    if (prompt === null || cached === null || output === null || cached > prompt) return null;
    return {
      uncachedInput: prompt - cached,
      cacheRead: cached,
      cacheWrite: 0,
      output,
      format: "openai-chat",
    };
  }
  if (!("input_tokens" in u)) return null;
  const input = count(u.input_tokens);
  const output = count(u.output_tokens);
  if (input === null || output === null) return null;
  if (isObj(u.input_tokens_details)) {
    const cached = count(u.input_tokens_details.cached_tokens);
    const written = count(u.input_tokens_details.cache_write_tokens);
    if (cached === null || written === null || cached + written > input) return null;
    return {
      uncachedInput: input - cached - written,
      cacheRead: cached,
      cacheWrite: written,
      output,
      format: "openai-responses",
    };
  }
  const read = count(u.cache_read_input_tokens);
  const created = count(u.cache_creation_input_tokens);
  if (read === null || created === null) return null;
  return { uncachedInput: input, cacheRead: read, cacheWrite: created, output, format: "anthropic" };
}

export type LineResult = { kind: "record"; record: UsageRecord } | { kind: "ignored" } | { kind: "invalid" };

/** Parses one JSONL line from a Claude Code transcript or a recorded provider request/response log. */
export function parseUsageLine(line: string): LineResult {
  if (!line.trim()) return { kind: "ignored" };
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return { kind: "invalid" };
  }
  if (!isObj(o)) return { kind: "invalid" };

  // Claude Code transcript: one line per content block, repeating the same message usage.
  if (typeof o.type === "string" && typeof o.sessionId === "string") {
    const m = o.message;
    if (o.type !== "assistant" || !isObj(m) || !isObj(m.usage)) return { kind: "ignored" };
    if (m.model === "<synthetic>") return { kind: "ignored" };
    const u = parseUsageObject(m.usage);
    if (u?.format !== "anthropic") return { kind: "invalid" };
    const id = str(o.requestId) ?? str(m.id) ?? str(o.uuid) ?? line;
    return {
      kind: "record",
      record: {
        key: shortHash(`claude-code\0${id}`),
        // Subagent (sidechain) requests share the parent sessionId but are separate conversations.
        session: shortHash(
          `${o.sessionId}\0${o.isSidechain === true ? (str(o.agentId) ?? "sidechain") : "main"}`,
        ),
        model: str(m.model),
        timestamp: str(o.timestamp),
        ...u,
        format: "claude-code",
      },
    };
  }

  const containers = [o, o.response, o.body, isObj(o.response) ? o.response.body : undefined].filter(isObj);
  const holder = containers.find((c) => isObj(c.usage));
  if (!holder || !isObj(holder.usage)) return { kind: "ignored" };
  const u = parseUsageObject(holder.usage);
  if (!u) return { kind: "invalid" };
  const meta = isObj(o.metadata) ? o.metadata : {};
  const session =
    str(o.session_id) ?? str(o.sessionId) ?? str(o.conversation_id) ?? str(meta.session_id) ?? null;
  const id = str(o.request_id) ?? str(o.requestId) ?? str(holder.id) ?? str(o.id) ?? null;
  const created = typeof holder.created === "number" ? new Date(holder.created * 1000).toISOString() : null;
  return {
    kind: "record",
    record: {
      key: shortHash(`${u.format}\0${id ?? line}`),
      session: session ? shortHash(session) : null,
      model: str(holder.model) ?? str(o.model),
      timestamp: str(o.timestamp) ?? created,
      ...u,
    },
  };
}

export interface IngestFileResult {
  name: string;
  records: UsageRecord[];
  duplicates: number;
  ignored: number;
  invalid: number;
}

/** Streams a JSONL file line by line (transcripts can be large). */
export async function ingestUsageFile(file: string): Promise<IngestFileResult> {
  const seen = new Map<string, UsageRecord>();
  let duplicates = 0;
  let ignored = 0;
  let invalid = 0;
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    const r = parseUsageLine(line);
    if (r.kind === "ignored") ignored++;
    else if (r.kind === "invalid") invalid++;
    else if (seen.has(r.record.key)) duplicates++;
    else seen.set(r.record.key, r.record);
  }
  return { name: path.basename(file), records: [...seen.values()], duplicates, ignored, invalid };
}

export async function loadUsage(file: string): Promise<UsageStore | null> {
  if (!existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new TokenwiseError(`${file} is not valid JSON; re-run tokenwise ingest --replace.`);
  }
  const parsed = UsageStoreSchema.safeParse(raw);
  if (!parsed.success) throw new TokenwiseError(`${file} does not match the usage store schema.`);
  return parsed.data;
}

/** Merges new results into a store; records already present (same key) count as duplicates. */
export function mergeUsage(
  store: UsageStore | null,
  results: IngestFileResult[],
  importedAt: string,
): { store: UsageStore; added: number; duplicates: number } {
  const records = new Map((store?.records ?? []).map((r) => [r.key, r]));
  const sources = [...(store?.sources ?? [])];
  let added = 0;
  let duplicates = 0;
  for (const res of results) {
    let fileAdded = 0;
    let fileDup = res.duplicates;
    for (const r of res.records) {
      if (records.has(r.key)) fileDup++;
      else {
        records.set(r.key, r);
        fileAdded++;
      }
    }
    added += fileAdded;
    duplicates += fileDup;
    sources.push({
      name: res.name,
      importedAt,
      records: fileAdded,
      duplicates: fileDup,
      ignored: res.ignored,
      invalid: res.invalid,
    });
  }
  return {
    store: { schemaVersion: 1, updatedAt: importedAt, sources, records: [...records.values()] },
    added,
    duplicates,
  };
}

export async function saveUsage(file: string, store: UsageStore): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, Buffer.from(`${JSON.stringify(store, null, 2)}\n`), 0o600);
}

export interface UsageStats {
  requests: number;
  sessions: number;
  /** Requests after the first in their session (they re-send prior context). */
  followUps: number;
  totalInput: number;
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  /** cacheRead / total input over follow-up requests; null without follow-ups. */
  followUpCacheShare: number | null;
  /** Mean total input per follow-up request. */
  meanFollowUpInput: number | null;
  models: string[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

export function computeUsageStats(records: UsageRecord[]): UsageStats {
  const sum = (rs: UsageRecord[], f: (r: UsageRecord) => number) => rs.reduce((n, r) => n + f(r), 0);
  const total = (r: UsageRecord) => r.uncachedInput + r.cacheRead + r.cacheWrite;
  const bySession = new Map<string, UsageRecord[]>();
  for (const r of records) {
    if (!r.session) continue;
    const list = bySession.get(r.session) ?? [];
    list.push(r);
    bySession.set(r.session, list);
  }
  const followUps: UsageRecord[] = [];
  for (const list of bySession.values()) {
    // Stable sort keeps file order for records without timestamps.
    const ordered = [...list].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
    followUps.push(...ordered.slice(1));
  }
  const followInput = sum(followUps, total);
  const stamps = records
    .map((r) => r.timestamp)
    .filter((t): t is string => Boolean(t))
    .sort();
  return {
    requests: records.length,
    sessions: bySession.size,
    followUps: followUps.length,
    totalInput: sum(records, total),
    uncachedInput: sum(records, (r) => r.uncachedInput),
    cacheRead: sum(records, (r) => r.cacheRead),
    cacheWrite: sum(records, (r) => r.cacheWrite),
    output: sum(records, (r) => r.output),
    followUpCacheShare: followInput > 0 ? sum(followUps, (r) => r.cacheRead) / followInput : null,
    meanFollowUpInput: followUps.length ? Math.round(followInput / followUps.length) : null,
    models: [...new Set(records.map((r) => r.model).filter((m): m is string => Boolean(m)))].sort(),
    firstTimestamp: stamps[0] ?? null,
    lastTimestamp: stamps.at(-1) ?? null,
  };
}
