import { findSecrets, isSecretFile, looksLikeApiKey, redact } from "@tokenwise/shared";
import { describe, expect, it } from "vitest";

const FAKE_ANTHROPIC = `sk-ant-api03-${"Hq7Vw2LmRt9KpXz4NcYb6JsDf3GuAe8WoQi1Mn5ZrTy0BvCx"}`;
const FAKE_GITHUB = `ghp_${"aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dF3hJ5"}`;

describe("redaction", () => {
  it.each([
    ["anthropic", FAKE_ANTHROPIC],
    ["github", FAKE_GITHUB],
    ["aws", "AKIAQ3EGZK7M2NXP4RTW"],
    ["private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----"],
    ["assignment", 'api_key = "Zr8Lq2Wn5Vx9Tc3Hb7Mj1Kp4"'],
  ])("redacts %s", (_name, secret) => {
    const out = redact(`before ${secret} after`);
    expect(out).not.toContain(secret);
    expect(out).toContain("[REDACTED:");
    expect(out.startsWith("before ")).toBe(true);
  });

  it("leaves placeholders, hex digests and paths alone", () => {
    const text =
      "key: sk-ant-your-key-here, sha: 3f786850e387550fdab836ed7e6dc881de23001b, path: src/lib/very/long/path/to/some/module/file.ts";
    expect(redact(text)).toBe(text);
    expect(findSecrets('api_key = "your-api-key-goes-here-please"')).toHaveLength(0);
  });

  it("detects API-key-looking config values", () => {
    expect(looksLikeApiKey(FAKE_ANTHROPIC)).toBe(true);
    expect(looksLikeApiKey("gpt-5")).toBe(false);
    expect(looksLikeApiKey("2000")).toBe(false);
  });

  it.each([
    ".env",
    ".env.local",
    "certs/server.pem",
    "id_rsa",
    "config/credentials.json",
    "deploy.key",
    "secrets.yaml",
  ])("treats %s as a secret file", (p) => expect(isSecretFile(p)).toBe(true));

  it.each(["CLAUDE.md", "environment.md", "keys.md", "docs/env-setup.md"])(
    "does not treat %s as a secret file",
    (p) => expect(isSecretFile(p)).toBe(false),
  );
});
