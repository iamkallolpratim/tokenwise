import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { editedPaths, HOOK_MARKER, hookFile, planHook } from "@tokenwise/integrations";
import { describe, expect, it } from "vitest";
import { tempDir } from "../helpers/cli.ts";

function project(file: string, content: string | Buffer): string {
  const root = tempDir();
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
  return root;
}

describe("hookFile", () => {
  it("uses the documented locations", () => {
    expect(hookFile("claude", "project", "/p", "/h")).toBe(path.join("/p", ".claude", "settings.json"));
    expect(hookFile("claude", "local", "/p", "/h")).toBe(path.join("/p", ".claude", "settings.local.json"));
    expect(hookFile("claude", "user", "/p", "/h")).toBe(path.join("/h", ".claude", "settings.json"));
    expect(hookFile("codex", "project", "/p", "/h")).toBe(path.join("/p", ".codex", "hooks.json"));
    expect(hookFile("codex", "user", "/p", "/h")).toBe(path.join("/h", ".codex", "hooks.json"));
    expect(() => hookFile("codex", "local", "/p", "/h")).toThrow(/no local hooks scope/);
  });
});

describe("planHook", () => {
  const existing = {
    permissions: { allow: ["Bash(ls)"] },
    hooks: {
      PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "prettier --write" }] }],
      Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
    },
  };

  it("adds one entry and keeps every other setting and hook", async () => {
    const root = project(".claude/settings.json", JSON.stringify(existing));
    const plan = await planHook({ target: "claude", scope: "project", projectRoot: root, home: root });
    const doc = JSON.parse(plan.after.toString());
    expect(doc.permissions).toEqual(existing.permissions);
    expect(doc.hooks.Stop).toEqual(existing.hooks.Stop);
    expect(doc.hooks.PostToolUse).toHaveLength(2);
    expect(doc.hooks.PostToolUse[0]).toEqual(existing.hooks.PostToolUse[0]);
    expect(doc.hooks.PostToolUse[1]).toEqual({
      matcher: "Edit|Write",
      hooks: [
        {
          type: "command",
          command: "npx --no-install @klawde/tokenwise hook run --target claude",
          timeout: 10,
        },
      ],
    });
    expect(plan.relPath).toBe(".claude/settings.json");
  });

  it("is idempotent, and --remove returns the original settings", async () => {
    const root = project(".claude/settings.json", `${JSON.stringify(existing, null, 2)}\n`);
    const once = await planHook({ target: "claude", scope: "project", projectRoot: root, home: root });
    writeFileSync(path.join(root, ".claude/settings.json"), once.after);
    const twice = await planHook({ target: "claude", scope: "project", projectRoot: root, home: root });
    expect(twice.changed).toBe(false);
    const removed = await planHook({
      target: "claude",
      scope: "project",
      projectRoot: root,
      home: root,
      remove: true,
    });
    expect(JSON.parse(removed.after.toString())).toEqual(existing);
  });

  it("creates a new file for Codex, preserving CRLF and BOM on existing files", async () => {
    const fresh = await planHook({
      target: "codex",
      scope: "project",
      projectRoot: tempDir(),
      home: tempDir(),
    });
    expect(fresh.before).toBeNull();
    expect(JSON.parse(fresh.after.toString()).hooks.PostToolUse[0].matcher).toBe("apply_patch");
    const crlf = project(
      ".codex/hooks.json",
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{\r\n  "hooks": {}\r\n}\r\n')]),
    );
    const p = await planHook({ target: "codex", scope: "project", projectRoot: crlf, home: crlf });
    expect([...p.after.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(p.after.toString()).toContain("\r\n");
    expect(p.after.toString().replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("refuses invalid JSON, a non-object hooks key, and a command it could not find again", async () => {
    const bad = project(".claude/settings.json", "{ nope");
    await expect(
      planHook({ target: "claude", scope: "project", projectRoot: bad, home: bad }),
    ).rejects.toThrow(/not valid JSON/);
    const arr = project(".claude/settings.json", '{"hooks": []}');
    await expect(
      planHook({ target: "claude", scope: "project", projectRoot: arr, home: arr }),
    ).rejects.toThrow(/not an object/);
    await expect(
      planHook({
        target: "claude",
        scope: "project",
        projectRoot: tempDir(),
        home: tempDir(),
        command: "echo hi",
      }),
    ).rejects.toThrow(HOOK_MARKER);
  });

  it("--remove on a file without the hook changes nothing", async () => {
    const root = tempDir();
    const p = await planHook({
      target: "claude",
      scope: "project",
      projectRoot: root,
      home: root,
      remove: true,
    });
    expect(p.changed).toBe(false);
  });
});

describe("editedPaths", () => {
  it("reads Claude Code file_path", () => {
    expect(editedPaths({ tool_name: "Edit", tool_input: { file_path: "/r/CLAUDE.md" } })).toEqual([
      "/r/CLAUDE.md",
    ]);
  });
  it("reads apply_patch file headers", () => {
    const patch =
      "*** Begin Patch\n*** Update File: AGENTS.md\n@@\n*** Add File: docs/new.md\n+x\n*** End Patch";
    expect(editedPaths({ tool_name: "apply_patch", tool_input: { command: patch } })).toEqual([
      "AGENTS.md",
      "docs/new.md",
    ]);
  });
  it("returns nothing for unexpected payloads", () => {
    expect(editedPaths(null)).toEqual([]);
    expect(editedPaths({ tool_input: "x" })).toEqual([]);
  });
});
