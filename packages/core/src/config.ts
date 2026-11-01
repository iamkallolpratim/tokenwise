import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigSchema, DEFAULT_CONFIG, type TokenwiseConfig, UsageError } from "@tokenwise/shared";
import type { z } from "zod";

export const PROJECT_CONFIG_FILE = "tokenwise.config.json";

export function userConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TOKENWISE_USER_CONFIG) return env.TOKENWISE_USER_CONFIG;
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "tokenwise", "config.json");
}

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep merge where arrays and scalars from `over` replace those in `base`. */
export function deepMerge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isPlainObject(b) && isPlainObject(v) ? deepMerge(b, v) : v;
  }
  return out;
}

export function formatZodIssues(error: z.ZodError, source: string): string[] {
  return error.issues.map((i) => `${source}: ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
}

function readJsonLayer(file: string): Json {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new UsageError(`Invalid config file ${file}`, [`${file}: ${(e as Error).message}`]);
  }
  if (!isPlainObject(raw))
    throw new UsageError(`Invalid config file ${file}`, [`${file}: must be a JSON object`]);
  return raw;
}

function validateLayer(merged: Json, source: string): void {
  const r = ConfigSchema.safeParse(merged);
  if (!r.success) throw new UsageError("Invalid configuration", formatZodIssues(r.error, source));
}

/** Environment variables that may override config. External calls can never be enabled by env (I1). */
export function envLayer(env: NodeJS.ProcessEnv): Json {
  const out: Json = {};
  if (env.TOKENWISE_MODEL) out.defaultModel = env.TOKENWISE_MODEL;
  if (env.TOKENWISE_MAX_FILE_SIZE) {
    const n = Number(env.TOKENWISE_MAX_FILE_SIZE);
    out.maxFileSizeBytes = Number.isFinite(n) ? n : env.TOKENWISE_MAX_FILE_SIZE;
  }
  return out;
}

export interface LoadConfigOptions {
  cwd: string;
  configPath?: string;
  flags?: Json;
  env?: NodeJS.ProcessEnv;
}

export interface LoadedConfig {
  config: TokenwiseConfig;
  projectConfigPath: string | null;
  sources: string[];
}

/** Precedence: CLI flags > env vars > project config > user config > defaults. */
export function loadConfig(opts: LoadConfigOptions): LoadedConfig {
  const env = opts.env ?? process.env;
  let merged: Json = structuredClone(DEFAULT_CONFIG) as unknown as Json;
  const sources = ["defaults"];

  const userFile = userConfigPath(env);
  if (existsSync(userFile)) {
    merged = deepMerge(merged, readJsonLayer(userFile));
    validateLayer(merged, userFile);
    sources.push(userFile);
  }

  const projectFile = opts.configPath
    ? path.resolve(opts.cwd, opts.configPath)
    : path.join(opts.cwd, PROJECT_CONFIG_FILE);
  let projectConfigPath: string | null = null;
  if (existsSync(projectFile)) {
    merged = deepMerge(merged, readJsonLayer(projectFile));
    validateLayer(merged, projectFile);
    sources.push(projectFile);
    projectConfigPath = projectFile;
  } else if (opts.configPath) {
    throw new UsageError(`Config file not found: ${projectFile}`);
  }

  const envJson = envLayer(env);
  if (Object.keys(envJson).length) {
    merged = deepMerge(merged, envJson);
    validateLayer(merged, "environment");
    sources.push("environment");
  }
  if (opts.flags && Object.keys(opts.flags).length) {
    merged = deepMerge(merged, opts.flags);
    validateLayer(merged, "command-line flags");
    sources.push("flags");
  }
  return { config: ConfigSchema.parse(merged), projectConfigPath, sources };
}

export function getConfigValue(config: TokenwiseConfig, key: string): unknown {
  let cur: unknown = config;
  for (const part of key.split(".")) {
    if (!isPlainObject(cur) || !(part in cur)) throw new UsageError(`Unknown config key: ${key}`);
    cur = cur[part];
  }
  return cur;
}

/** Parse a CLI-provided value: JSON if it parses, else a plain string. */
export function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function setConfigValue(raw: Json, key: string, value: unknown): Json {
  const parts = key.split(".");
  const out = structuredClone(raw);
  let cur: Json = out;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (!isPlainObject(next)) cur[part] = {};
    cur = cur[part] as Json;
  }
  const last = parts.at(-1);
  if (last === undefined) throw new UsageError("Empty config key");
  cur[last] = value;
  return out;
}
