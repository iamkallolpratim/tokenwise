import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import {
  deepMerge,
  formatZodIssues,
  getConfigValue,
  loadConfig,
  PROJECT_CONFIG_FILE,
  parseConfigValue,
  setConfigValue,
} from "@tokenwise/core";
import { ConfigSchema, DEFAULT_CONFIG, looksLikeApiKey, UsageError } from "@tokenwise/shared";
import type { Command } from "commander";
import { globals, resolveCwd } from "../context.ts";
import { createOutput, printJson } from "../output/io.ts";

export function registerConfig(program: Command): void {
  const config = program.command("config").description("Show, get, or set validated configuration");

  config
    .command("show")
    .description("Print the effective configuration and where it came from")
    .action((_opts: unknown, cmd: Command) => {
      const g = globals(cmd);
      const loaded = loadConfig({ cwd: resolveCwd(g), ...(g.config ? { configPath: g.config } : {}) });
      printJson({ config: loaded.config, sources: loaded.sources });
    });

  config
    .command("get <key>")
    .description("Print one configuration value (dot path, e.g. thresholds.rootInstructionTokens)")
    .action((key: string, _opts: unknown, cmd: Command) => {
      const g = globals(cmd);
      const loaded = loadConfig({ cwd: resolveCwd(g), ...(g.config ? { configPath: g.config } : {}) });
      printJson(getConfigValue(loaded.config, key));
    });

  config
    .command("set <key> <value>")
    .description("Set a value in the project tokenwise.config.json (value parsed as JSON when possible)")
    .action(async (key: string, rawValue: string, _opts: unknown, cmd: Command) => {
      const g = globals(cmd);
      const cwd = resolveCwd(g);
      const out = createOutput(g);
      if (looksLikeApiKey(rawValue)) {
        throw new UsageError(
          "Refusing to store a value that looks like an API key. Provide keys via environment variables.",
        );
      }
      const file = g.config ? path.resolve(cwd, g.config) : path.join(cwd, PROJECT_CONFIG_FILE);
      const current = existsSync(file)
        ? (JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>)
        : { version: 1 };
      // Validate the key exists in the schema by resolving it against defaults.
      getConfigValue(
        DEFAULT_CONFIG,
        key
          .split(".")
          .slice(0, key.startsWith("pricing.") ? 1 : undefined)
          .join("."),
      );
      const next = setConfigValue(current, key, parseConfigValue(rawValue));
      const check = ConfigSchema.safeParse(
        deepMerge(structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>, next),
      );
      if (!check.success)
        throw new UsageError("Invalid configuration value", formatZodIssues(check.error, key));
      await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
      out.info(`set ${key} in ${path.relative(cwd, file) || file}`);
    });
}
