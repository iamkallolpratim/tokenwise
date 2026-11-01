import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  checkPreservation,
  type DiscoveredFile,
  decode,
  extractProtectedSpans,
  optimizeFiles,
  TokenCounter,
} from "@tokenwise/core";
import { DEFAULT_CONFIG, normalizeWhitespace } from "@tokenwise/shared";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../helpers/cli.ts";

const DIR = path.join(REPO_ROOT, "tests", "fixtures", "preservation");

function asFile(name: string, text?: string): DiscoveredFile {
  const buf = text === undefined ? readFileSync(path.join(DIR, name)) : Buffer.from(text);
  // Virtual path CLAUDE.md so the file is treated as always-loaded instructions.
  return {
    path: "CLAUDE.md",
    absolutePath: path.join(DIR, name),
    category: "agent-instructions",
    reasons: [],
    sizeBytes: buf.length,
    file: { ...decode(buf), mode: 0o644 },
  };
}

const opts = { config: DEFAULT_CONFIG, counter: new TokenCounter("gpt-5"), targetRepoPath: "." };

const MUST_KEEP: Record<string, string[]> = {
  "negations.md": [
    "Never deploy on Fridays unless the incident commander approves.",
    "Do not skip the canary stage except for documented hotfixes.",
    "Only if the feature flag `ENABLE_X` is on may you run the migration.",
  ],
  "security.md": [
    "You MUST NOT log personal data such as email addresses.",
    "A human must approve any deletion of production data before it runs.",
    "never paste credentials into chat.",
  ],
  "identifiers.md": [
    "`POST /v2/orders`",
    "https://api.acme.example/v2/orders",
    "`order_id`",
    "`customerRef`",
    "`config/app.yaml`",
    "src/types/order.ts",
    "interface Order { order_id: string; customerRef: string; totalCents: number }",
  ],
  "output-format.md": [
    "Respond in JSON matching this schema exactly:",
    '{ "answer": "string", "escalate": "boolean" }',
    "Return only the JSON object, with no prose.",
    "Sources: [1] Internal style guide, 2025.",
  ],
  "citations.md": [
    "(Nogueira, 2019) [1]",
    "[1]: Passage re-ranking with BERT.",
    "See [^2] for the evaluation setup.",
  ],
};

describe("I3 preservation (table-driven)", () => {
  const fixtures = readdirSync(DIR).sort();

  it("every fixture has a must-keep list", () => {
    expect(Object.keys(MUST_KEEP).sort()).toEqual(fixtures);
  });

  describe.each(fixtures)("%s", (name) => {
    it("optimization changes the file but keeps every protected statement", async () => {
      const r = await optimizeFiles([asFile(name)], opts);
      const f = r.files[0];
      expect(f?.status).toBe("changed");
      const after = normalizeWhitespace(f?.after ?? "");
      for (const keep of MUST_KEEP[name] ?? []) expect(after).toContain(normalizeWhitespace(keep));
      expect(
        checkPreservation(f?.before ?? "", f?.after ?? "", []).violations.every((v) => v.after >= 1),
      ).toBe(true);
    });

    it("is idempotent: a second pass produces no change", async () => {
      const first = (await optimizeFiles([asFile(name)], opts)).files[0];
      const second = (await optimizeFiles([asFile(name, first?.after)], opts)).files[0];
      expect(second?.status).toBe("unchanged");
    });

    it("rejects a forced transformation that drops a protected statement", async () => {
      const victim = MUST_KEEP[name]?.[0] ?? "";
      const r = await optimizeFiles([asFile(name)], {
        ...opts,
        postTransform: (_p, t) => t.split(victim).join(""),
      });
      expect(r.files[0]?.status).toBe("rejected");
      expect(r.files[0]?.after).toBe(r.files[0]?.before);
    });

    it("rejects a forced transformation that alters a protected statement", async () => {
      const r = await optimizeFiles([asFile(name)], {
        ...opts,
        postTransform: (_p, t) => t.replace(/never|MUST NOT|only|exactly|https:\/\/|\[1\]/i, "maybe"),
      });
      expect(r.files[0]?.status).toBe("rejected");
    });
  });
});

describe("checkPreservation", () => {
  it("allows removing a declared exact duplicate when one copy remains", () => {
    const a = "Never do X.\n\nNever do X.\n";
    expect(checkPreservation(a, "Never do X.\n", ["Never do X."]).ok).toBe(true);
  });
  it("forbids removing the last copy even if declared", () => {
    expect(checkPreservation("Never do X.\n", "", ["Never do X."]).ok).toBe(false);
  });
  it("forbids altering one copy while another remains", () => {
    const r = checkPreservation("Never do X.\n\nNever do X.\n", "Never do X.\n\nAlways do X.\n", []);
    expect(r.ok).toBe(false);
  });
  it("ignores whitespace-only differences", () => {
    expect(checkPreservation("You MUST   run `a`.\n", "You MUST run `a`.\n").ok).toBe(true);
  });
  it("extracts each protected kind", () => {
    const kinds = new Set(
      extractProtectedSpans(
        "Never X. You MUST Y. Respond in JSON. Call `f()` at https://x.example/a or /v2/orders, see src/a.ts and orderId (Smith, 2020).\n```\ncode\n```\n",
        { a: { b: 1 } },
      ).map((s) => s.kind),
    );
    for (const k of [
      "negation",
      "normative",
      "output-format",
      "inline-code",
      "url",
      "endpoint",
      "path",
      "identifier",
      "citation",
      "code-block",
      "structured-key",
    ]) {
      expect(kinds).toContain(k);
    }
  });
});
