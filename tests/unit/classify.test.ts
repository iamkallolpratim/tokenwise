import { classify } from "@tokenwise/core";
import { describe, expect, it } from "vitest";

describe("classify", () => {
  it.each([
    ["CLAUDE.md", "# hi", "agent-instructions"],
    ["AGENTS.md", "# hi", "agent-instructions"],
    ["pkg/GEMINI.md", "# hi", "agent-instructions"],
    [".claude/skills/x/SKILL.md", "---\nname: x\n---", "skill"],
    [".agents/skills/x/SKILL.md", "---\nname: x\n---", "skill"],
    [".claude/agents/reviewer.md", "You review code.", "subagent"],
    [".claude/commands/fix.md", "Fix the bug.", "prompt-template"],
    ["prompts/support.md", "Hello", "prompt-template"],
    ["tools/tools.json", '{"tools":[{"name":"a","description":"b","input_schema":{}}]}', "tool-schema"],
    ["config/rag.yaml", "top_k: 5\nchunk_size: 100", "rag-config"],
    ["agent.config.json", '{"system":"x","model":"gpt-5"}', "agent-config"],
    ["src/system-prompt.txt", "You are a bot.\nAlways answer briefly.\nNever lie.", "prompt-template"],
  ])("%s → %s", (p, text, cat) => {
    expect(classify(p, text)?.category).toBe(cat);
  });

  it.each([
    [
      "README.md",
      "You are reading the readme. You must install. Always run tests. Never commit. Do not push.",
    ],
    ["package.json", '{"name":"x","description":"You are not a prompt","model":"a","system":"b"}'],
    ["docs/notes.md", "# Notes\nThe service has three layers."],
    ["docs/agent-architecture.md", "# Agents\nThis doc explains our agent design."],
    ["data/users.json", '{"users":[{"name":"a"}]}'],
    ["CHANGELOG.md", "## 1.0\n- You must upgrade."],
  ])("%s is not a prompt", (p, text) => {
    expect(classify(p, text)).toBeNull();
  });
});
