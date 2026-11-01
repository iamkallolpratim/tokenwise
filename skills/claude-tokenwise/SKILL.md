---
name: tokenwise
description: Audit and reduce token usage in CLAUDE.md, .claude/ rules, skills, subagents, prompt files and tool schemas with the TokenWise CLI. Use when the user asks why context is large, wants to shrink or clean up instructions, find duplicated or wasteful prompt text, count tokens, or check agent, tool or RAG configuration for token waste. Not for general code refactoring.
---

# TokenWise for Claude Code

All analysis comes from the `tokenwise` CLI. Do not reimplement its rules from these notes.

## 1. Check the CLI

Run `npx @klawde/tokenwise --version`. If it fails, tell the user TokenWise needs Node.js 26+ and runs with `npx @klawde/tokenwise` (no API keys), then stop.

## 2. Workflow

1. **Audit**: `npx @klawde/tokenwise audit . --format json`. Add `--model <id>` when the user names a model; without one, counts are `estimated`.
2. **Explain** the top findings, CRITICAL and HIGH first: location, cost (`estimatedSavings.tokens` with its `basis`), and `risk`.
3. **Propose** changes as a diff. `npx @klawde/tokenwise optimize . --format json` returns protection-checked diffs for auto-fixable findings. For other findings, draft the edit yourself and show the diff.
4. **Apply only after the user approves**: `npx @klawde/tokenwise optimize . --apply`, or your own edit that keeps every protected statement.
5. **Verify**: re-run the audit and report the token change with its method. Say "Quality: not verified" unless an evaluation ran (`npx @klawde/tokenwise benchmark --eval .tokenwise/evals`).

Undo with `npx @klawde/tokenwise restore --list` and `npx @klawde/tokenwise restore <id>`.

## 3. Claude Code specifics

- Root `CLAUDE.md` loads every session. Move specialized sections to `.claude/rules/*.md` with a `paths` field, or into a skill.
- `@path` imports organize text but do not reduce context.
- When `CLAUDE.md` and `AGENTS.md` both exist, Claude Code reads only `CLAUDE.md`; share text by importing `@AGENTS.md` from `CLAUDE.md`.
- Subagents in `.claude/agents/` should hold role-specific context only.

## 4. Edits you write

Keep negations, MUST/SHOULD rules, security, privacy and approval statements, code, paths, URLs, identifiers and output formats verbatim. Do not send file content to external services unless the user asks.

## References (open when needed)

- [references/optimization-rules.md](references/optimization-rules.md): rule IDs, when each fix is safe, how to read the numbers.
- [references/prompt-engineering.md](references/prompt-engineering.md): cheaper phrasing that keeps behavior.
- [references/agent-optimization.md](references/agent-optimization.md): context loading, subagents, tools, RAG, caching, routing.
- [references/safety-guardrails.md](references/safety-guardrails.md): what must never be removed.
