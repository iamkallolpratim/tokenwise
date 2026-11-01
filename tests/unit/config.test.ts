import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "@tokenwise/core";
import { UsageError } from "@tokenwise/shared";
import { describe, expect, it } from "vitest";
import { tempDir } from "../helpers/cli.ts";

function setup(project?: object, user?: object) {
  const dir = tempDir();
  const userFile = path.join(dir, "user", "config.json");
  mkdirSync(path.dirname(userFile), { recursive: true });
  if (user) writeFileSync(userFile, JSON.stringify(user));
  if (project) writeFileSync(path.join(dir, "tokenwise.config.json"), JSON.stringify(project));
  return { dir, env: { TOKENWISE_USER_CONFIG: userFile } as NodeJS.ProcessEnv };
}

describe("config precedence", () => {
  it("uses defaults when nothing is configured", () => {
    const { dir, env } = setup();
    const { config } = loadConfig({ cwd: dir, env });
    expect(config.defaultModel).toBeNull();
    expect(config.privacy.externalModelCalls).toBe(false);
    expect(config.thresholds.rootInstructionTokens).toBe(2000);
  });

  it("flags > env > project > user > defaults", () => {
    const { dir, env } = setup(
      { version: 1, defaultModel: "project-model", maxFileSizeBytes: 10 },
      { defaultModel: "user-model", maxFileSizeBytes: 20, thresholds: { rootInstructionTokens: 5 } },
    );
    expect(loadConfig({ cwd: dir, env }).config).toMatchObject({
      defaultModel: "project-model",
      maxFileSizeBytes: 10,
      thresholds: { rootInstructionTokens: 5 },
    });
    const withEnv = { ...env, TOKENWISE_MODEL: "env-model" };
    expect(loadConfig({ cwd: dir, env: withEnv }).config.defaultModel).toBe("env-model");
    expect(
      loadConfig({ cwd: dir, env: withEnv, flags: { defaultModel: "flag-model" } }).config.defaultModel,
    ).toBe("flag-model");
  });

  it("reports field-level errors with the source file", () => {
    const { dir, env } = setup({ version: 1, thresholds: { nearDuplicateJaccard: 3 }, bogus: true });
    try {
      loadConfig({ cwd: dir, env });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UsageError);
      const details = (e as UsageError).details.join("\n");
      expect(details).toMatch(/tokenwise\.config\.json: thresholds\.nearDuplicateJaccard/);
      expect(details).toMatch(/bogus/);
      expect((e as UsageError).exitCode).toBe(2);
    }
  });

  it("cannot enable telemetry or external calls from the environment", () => {
    const { dir, env } = setup();
    const { config } = loadConfig({ cwd: dir, env: { ...env, TOKENWISE_EXTERNAL_MODEL_CALLS: "true" } });
    expect(config.privacy.externalModelCalls).toBe(false);
    const bad = setup({ version: 1, privacy: { telemetry: true, externalModelCalls: false } });
    expect(() => loadConfig({ cwd: bad.dir, env: bad.env })).toThrow(UsageError);
  });
});
