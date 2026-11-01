---
title: Codex skill
description: Install the TokenWise skill for Codex at project or user scope and use it to audit AGENTS.md and skills.
---

After this page you can ask Codex to audit your agent instructions and propose reviewed changes.

The skill teaches Codex when and how to run the `tokenwise` CLI. All analysis comes from the CLI.

## Install

Preview, then install into the current repository (`.agents/skills/tokenwise/`):

```bash
tokenwise install-skill --target codex --scope project
tokenwise install-skill --target codex --scope project --apply
```

For your user account (`~/.agents/skills/tokenwise/`):

```bash
tokenwise install-skill --target codex --scope user --apply
```

An existing `tokenwise` skill directory is never overwritten unless you add `--force`.

## What gets installed

```text
tokenwise/
├── SKILL.md         name + description frontmatter (both required by Codex) and the workflow
└── references/      optimization-rules, prompt-engineering, agent-optimization, safety-guardrails
```

Codex lists each skill's name and description up front and loads the full `SKILL.md` only when it selects the skill. How Codex loads files under `references/` is not documented; the skill names them by relative path and tells the agent to open them when needed.

No `agents/openai.yaml` is shipped, so implicit invocation stays at its default (enabled).

## Use

Ask Codex to "audit AGENTS.md for token waste" or "shrink our agent instructions". It runs `tokenwise audit . --format json`, explains findings with their risk, shows diffs, and applies changes only after you approve. Its focus is `AGENTS.md`, skill directories, task-specific instructions and delegation patterns.

## Optional hook

See [Hooks](../hooks/) for a read-only PostToolUse hook that reports findings after Codex edits an instruction file.

## Uninstall

Delete `.agents/skills/tokenwise/` (project) or `~/.agents/skills/tokenwise/` (user).
