import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { type LoadedConfig, loadConfig, TokenCounter } from "@tokenwise/core";
import { UsageError } from "@tokenwise/shared";
import type { TokenizerRegistry } from "@tokenwise/tokenizers";
import type { Command } from "commander";
import { createOutput, type Output } from "./output/io.ts";

export interface GlobalOptions {
  quiet?: boolean;
  verbose?: boolean;
  config?: string;
  cwd?: string;
  color?: boolean;
}

export interface CommandContext {
  cwd: string;
  out: Output;
  loaded: LoadedConfig;
  /** Absolute scan target. */
  target: string;
  /** Root for repo-relative paths: cwd if the target is inside it, else the target directory. */
  root: string;
}

export function globals(cmd: Command): GlobalOptions {
  return cmd.optsWithGlobals() as GlobalOptions;
}

export function resolveCwd(g: GlobalOptions): string {
  const cwd = path.resolve(g.cwd ?? process.cwd());
  if (!existsSync(cwd) || !statSync(cwd).isDirectory())
    throw new UsageError(`--cwd is not a directory: ${cwd}`);
  return cwd;
}

export function createContext(
  cmd: Command,
  targetArg?: string,
  flags: Record<string, unknown> = {},
): CommandContext {
  const g = globals(cmd);
  const cwd = resolveCwd(g);
  const out = createOutput(g);
  const loaded = loadConfig({ cwd, ...(g.config ? { configPath: g.config } : {}), flags });
  const target = path.resolve(cwd, targetArg ?? ".");
  if (!existsSync(target)) throw new UsageError(`Path not found: ${targetArg ?? "."}`);
  const rel = path.relative(cwd, target);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  const root = inside ? cwd : statSync(target).isDirectory() ? target : path.dirname(target);
  return { cwd, out, loaded, target, root };
}

export function createCounter(
  ctx: CommandContext,
  model?: string,
  registry?: TokenizerRegistry,
): TokenCounter {
  return new TokenCounter(model ?? ctx.loaded.config.defaultModel ?? undefined, registry);
}
