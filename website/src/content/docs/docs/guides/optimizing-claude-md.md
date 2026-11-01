---
title: Optimizing CLAUDE.md
description: Find and remove token waste in CLAUDE.md files and .claude/ configuration without losing instructions.
---

After this guide you can shrink an always-loaded `CLAUDE.md` safely and know which findings to act on by hand.

## Why CLAUDE.md matters

Claude Code loads the root `CLAUDE.md` into every session, so each token in it is paid on every task. `@path` imports do not reduce that cost: imported files are loaded too. Path-scoped rules in `.claude/rules/*.md` (with a `paths` field) and skills load only when needed.

## Audit it

```bash
tokenwise audit CLAUDE.md --model gpt-5 --verbose
```

Findings you will typically see:

| Rule | What it means | Auto-fix |
|---|---|---|
| [RED-001](../../reference/rules/#red-001), [RED-002](../../reference/rules/#red-002) | A paragraph or whole section is repeated exactly | Yes, when safe |
| [RED-003](../../reference/rules/#red-003) | Near-duplicate paragraphs | No |
| [FMT-001](../../reference/rules/#fmt-001) | Trailing whitespace, runs of blank lines | Yes |
| [VERB-001](../../reference/rules/#verb-001), [VERB-002](../../reference/rules/#verb-002) | Filler phrases, social preambles | No |
| [CTX-001](../../reference/rules/#ctx-001) | The file is over `thresholds.rootInstructionTokens` (2,000) | No |
| [CTX-002](../../reference/rules/#ctx-002) | A pasted log, data dump or long table | No |
| [SEC-002](../../reference/rules/#sec-002) | A MUST and a MUST NOT about the same thing | No |

With `--verbose`, CTX-001 lists the largest sections with their line ranges and token counts: those are the candidates to move on demand.

## Apply the safe part

```bash
tokenwise optimize CLAUDE.md --model gpt-5          # diff only
tokenwise optimize CLAUDE.md --model gpt-5 --apply  # backup, then write
```

Only exact, structural fixes are applied, and only if every protected statement (negations, security rules, identifiers, paths, code) is still present afterwards. Otherwise the file is rejected and left unchanged. See [Safety guarantees](../../concepts/safety-guarantees/).

## Do the rest by hand

- **Move specialized sections out.** Put rules that apply to one area into `.claude/rules/<area>.md` with a `paths` field, or into a skill. Keep in `CLAUDE.md` only what every task needs.
- **Replace pasted logs and tables** with a one-line summary and a path to the file that holds them.
- **Resolve contradictions** flagged by SEC-002: decide which rule applies, or add the condition that separates them.
- **Check `CLAUDE.md` against `AGENTS.md`.** When both exist, Claude Code reads `CLAUDE.md`. If they repeat each other, [RED-004](../../reference/rules/#red-004) reports it; you can keep one and import it with `@AGENTS.md`, knowing the import does not shrink context.

Re-run the audit after each change. To check that behavior is unchanged, add an [evaluation suite](../benchmarking-and-evals/).

## Let Claude Code do it

The [Claude Code skill](../../agent-skills/claude-code/) runs the same audit, explains findings, proposes diffs, and applies them only after you approve.
