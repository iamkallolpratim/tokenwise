---
name: tokenwise
description: Audit and reduce token usage in AGENTS.md files, skills, task instructions, prompt files and tool schemas with the TokenWise CLI. Use when asked why context is large, to shrink or clean up agent instructions, find duplicated or wasteful prompt text, count tokens, or check delegation, tool or RAG setup for token waste. Not for general code refactoring.
---

# TokenWise for Codex

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

## 3. Codex specifics

- Codex reads one instruction file per directory (`AGENTS.override.md`, then `AGENTS.md`) from the repo root down to the working directory. Move instructions that apply to one area into a nested `AGENTS.md` there.
- Codex stops adding instruction files once their combined size reaches `project_doc_max_bytes`, so later (deeper) files can be dropped.
- Put task-specific workflows in skills under `.agents/skills/`; only their name and description load until used.
- When delegating, give each subtask a short brief with its inputs and done-criteria instead of the full history. Decompose work into steps that each end in a check.

## 4. Edits you write

Keep negations, MUST/SHOULD rules, security, privacy and approval statements, code, paths, URLs, identifiers and output formats verbatim. Do not send file content to external services unless the user asks.

## References (open when needed)

- `references/optimization-rules.md`: rule IDs, when each fix is safe, how to read the numbers.
- `references/prompt-engineering.md`: cheaper phrasing that keeps behavior.
- `references/agent-optimization.md`: context loading, delegation, tools, RAG, caching, routing.
- `references/safety-guardrails.md`: what must never be removed.
