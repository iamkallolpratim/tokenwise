---
title: Claude Code skill
description: Install the TokenWise skill for Claude Code at project or user scope and use it to clean up instructions.
---

After this page you can ask Claude Code to audit and shrink your instruction files, with every change shown to you first.

The skill teaches Claude Code when and how to run the `tokenwise` CLI. It contains no analysis logic of its own: findings always come from the CLI.

## Install

Preview, then install into the current project (`.claude/skills/tokenwise/`):

```bash
tokenwise install-skill --target claude --scope project
tokenwise install-skill --target claude --scope project --apply
```

For every project on this machine (`~/.claude/skills/tokenwise/`):

```bash
tokenwise install-skill --target claude --scope user --apply
```

Without `--apply` nothing is copied. An existing `tokenwise` skill directory is never overwritten unless you add `--force`.

## What gets installed

```text
tokenwise/
├── SKILL.md            workflow and decision points, loaded when the skill triggers
└── references/         opened only when needed
    ├── optimization-rules.md
    ├── prompt-engineering.md
    ├── agent-optimization.md
    └── safety-guardrails.md
```

`SKILL.md` uses the `name` and `description` frontmatter fields. Claude Code truncates `description` plus `when_to_use` at 1,536 characters in its skill listing; the TokenWise description is well under that.

## Use

Ask things like:

- "Why is my context so big?"
- "Clean up CLAUDE.md."
- "Find duplicated instructions across our subagents."

Or invoke it directly with `/tokenwise`. The skill follows a fixed workflow:

1. Run `tokenwise audit . --format json`.
2. Explain the top findings, each with its risk.
3. Propose changes as a diff (`tokenwise optimize . --format json` for the automatic ones).
4. Apply only after you approve, with `tokenwise optimize . --apply` or edits that keep every protected statement.
5. Re-run the audit and report the change, labeled with its counting method and "Quality: not verified" unless an evaluation ran.

## Optional hook

A read-only hook can report new HIGH and CRITICAL findings back to Claude after it edits an instruction file. See [Hooks](../hooks/).

## Uninstall

Delete `.claude/skills/tokenwise/` (project) or `~/.claude/skills/tokenwise/` (user).

Conventions were checked against the Claude Code documentation; see [Sources](../../project/sources/).
