import path from "node:path";
import {
  buildFileContexts,
  computeScore,
  type DiscoveredFile,
  decode,
  discover,
  optimizeFiles,
  runAudit,
  TokenCounter,
} from "@tokenwise/core";
import { DEFAULT_CONFIG, type Finding } from "@tokenwise/shared";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "../helpers/cli.ts";

const counter = new TokenCounter("gpt-5");

async function scoreFor(files: DiscoveredFile[]) {
  const contexts = buildFileContexts(files, ".");
  const findings = (await runAudit(contexts, { config: DEFAULT_CONFIG, counter })) as Finding[];
  const tokens = new Map(
    await Promise.all(files.map(async (f) => [f.path, await counter.tokens(f.file.text)] as const)),
  );
  return computeScore({ files: contexts, findings, tokens, rootInstructionTokens: 2000 });
}

function file(p: string, text: string): DiscoveredFile {
  return {
    path: p,
    absolutePath: p,
    category: "agent-instructions",
    reasons: [],
    sizeBytes: text.length,
    file: { ...decode(Buffer.from(text)), mode: 0o644 },
  };
}

describe("Token Efficiency Score", () => {
  it("marks dimensions without evidence n/a and renormalizes", async () => {
    const s = await scoreFor([file("CLAUDE.md", "# P\n\nRun the tests before you finish.\n")]);
    const byKey = Object.fromEntries(s.dimensions.map((d) => [d.key, d]));
    expect(byKey.tool?.score).toBeNull();
    expect(byKey.output?.score).toBeNull();
    expect(byKey.agentLoop?.score).toBeNull();
    expect(byKey.prompt?.score).toBe(100);
    expect(s.renormalized).toBe(true);
    expect(s.note).toMatch(/renormalized over 2 of 5/);
    for (const d of s.dimensions) expect(d.explanation.length).toBeGreaterThan(10);
    expect(s.score).toBe(100);
  });

  it("is n/a overall when no dimension has evidence", () => {
    const s = computeScore({ files: [], findings: [], tokens: new Map(), rootInstructionTokens: 2000 });
    expect(s.score).toBeNull();
  });

  it("caps the score while a CRITICAL finding is open and says so", async () => {
    const s = await scoreFor([
      file(
        "AGENTS.md",
        "# R\n\n- You MUST squash commits before merging.\n- You MUST NOT squash commits before merging.\n",
      ),
    ]);
    expect(s.score).toBeLessThanOrEqual(50);
    expect(s.cappedBy).toMatch(/SEC-002/);
  });

  it("deleting requirements through TokenWise can never raise the score (I3 rejects it)", async () => {
    const { files } = await discover({
      config: DEFAULT_CONFIG,
      target: path.join(REPO_ROOT, "examples", "sample-project"),
      root: path.join(REPO_ROOT, "examples", "sample-project"),
    });
    const before = await scoreFor(files);
    const r = await optimizeFiles(files, {
      config: DEFAULT_CONFIG,
      counter,
      targetRepoPath: ".",
      // A "fix" that strips every MUST/never line: exactly what must be impossible.
      postTransform: (_p, t) =>
        t
          .split("\n")
          .filter((l) => !/\b(MUST|never|Never|Do not|do not)\b/.test(l))
          .join("\n"),
    });
    const changed = r.files.filter((f) => f.status === "changed");
    expect(changed).toEqual([]);
    const after = await scoreFor(
      files.map((f) => ({
        ...f,
        file: { ...f.file, text: r.files.find((x) => x.path === f.path)?.after ?? f.file.text },
      })),
    );
    expect(after.score).toBe(before.score);
  });

  it("deleting required content by hand does not raise prompt efficiency", async () => {
    const base =
      "# P\n\n## A\n\nRun the whole test suite with the standard command before you open a pull request.\n\nRun the whole test suite with the standard command before you open a pull request.\n\n## Security\n\nNever log customer email addresses. You MUST NOT commit secrets.\n";
    const stripped = base.replace("Never log customer email addresses. You MUST NOT commit secrets.\n", "");
    const a =
      (await scoreFor([file("CLAUDE.md", base)])).dimensions.find((d) => d.key === "prompt")?.score ?? 0;
    const b =
      (await scoreFor([file("CLAUDE.md", stripped)])).dimensions.find((d) => d.key === "prompt")?.score ?? 0;
    expect(b).toBeLessThanOrEqual(a);
  });
});
