---
title: Sources
description: The external conventions TokenWise relies on, where each was verified, and when.
---

After this page you can check every external fact TokenWise depends on against its source. Website sources (Astro, Starlight, GitHub Pages) are in `website/SOURCES.md`.

Every external convention TokenWise relies on, where it was verified, and when.
All entries were checked on **2026-10-30**. Anything not listed here, or marked
`UNVERIFIED`, is not relied on by the code.

| Topic | Fact relied on | Source |
|---|---|---|
| Node.js LTS | v26 is "Latest LTS" (v26.13.0); v24 and v22 still LTS; v20 EOL (2026-03-24). `engines.node` set to `>=26.0.0`. | https://nodejs.org/en/about/previous-releases |
| Claude Code skills | Project skills: `.claude/skills/<name>/SKILL.md`; personal: `~/.claude/skills/<name>/SKILL.md`. YAML frontmatter must start on line 1. No field strictly required; `description` recommended. `description` + `when_to_use` truncated at 1,536 chars in the listing. `SKILL.md` body recommended under 500 lines. Supporting files in the skill dir are loaded only when referenced/needed. Unknown fields ignored. | https://code.claude.com/docs/en/skills |
| Claude Code memory | `CLAUDE.md` supports `@path/to/file` imports (relative to the importing file, max depth 4 hops). Imports do **not** reduce context cost. Recommended < 200 lines per CLAUDE.md. `.claude/rules/*.md` with `paths` frontmatter load only for matching files. Claude Code reads `AGENTS.md` when no `CLAUDE.md` exists; a `CLAUDE.md` may import `AGENTS.md`. | https://code.claude.com/docs/en/memory |
| Codex skills | Repo skills: `.agents/skills/<name>/SKILL.md` (scanned from CWD up to repo root); user: `$HOME/.agents/skills`. Frontmatter requires `name` and `description`. Initial skill list budget ≈2% of context or 8,000 chars. Full `SKILL.md` loaded only when selected. Optional `agents/openai.yaml` for UI metadata/policy. | https://developers.openai.com/codex/skills (redirects to https://learn.chatgpt.com/docs/build-skills) |
| Codex AGENTS.md | Per directory: `AGENTS.override.md`, then `AGENTS.md`, then fallback names; at most one file per directory. Global: `~/.codex` (or `$CODEX_HOME`). Combined size capped by `project_doc_max_bytes` (32 KiB default — stated in an OpenAI localized page; treat the exact default as `UNVERIFIED`). No import mechanism documented. | https://developers.openai.com/codex/guides/agents-md |
| OpenAI tokenization | Model → encoding table: `gpt-5*`, `gpt-4.1*`, `gpt-4.5-*`, `gpt-4o*`, `chatgpt-4o-*`, `o1-*`, `o3-*`, `o4-mini-*` → `o200k_base`; `gpt-4`, `gpt-4-*`, `gpt-3.5-turbo*`, `gpt-35-turbo*` → `cl100k_base`; `gpt-oss-*` → `o200k_harmony`. | https://github.com/openai/tiktoken/blob/main/tiktoken/model.py |
| JS tokenizer | `gpt-tokenizer@4.1.0` — pure JS, no dependencies, ships `o200k_base`, `o200k_harmony`, `cl100k_base` encodings at `gpt-tokenizer/encoding/<name>` with `countTokens()`. | https://github.com/niieani/gpt-tokenizer (npm `gpt-tokenizer`, modified 2026-10-18) |
| Anthropic token counting | `POST https://api.anthropic.com/v1/messages/count_tokens`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body `{model, system?, messages, tools?}`; response `{input_tokens}`. Free, rate-limited. The count is itself documented as an estimate. Claude 4.7+ use a newer tokenizer (~30% more tokens than earlier models). No official offline tokenizer for current Claude models is documented → local Claude counts are `estimated`. | https://platform.claude.com/docs/en/build-with-claude/token-counting |

## UNVERIFIED

- Codex `project_doc_max_bytes` exact default (32 KiB) — only seen on a localized page and third-party posts. TokenWise does not enforce it; CTX-001 uses the user's `rootInstructionTokens` threshold instead.
- How Codex loads files under a skill's `references/` directory — the official page does not say. The Codex skill references them by relative path and instructs the agent to open them on demand.
- Codex `apply_patch` hook input shape: the docs say `tool_input` is passed but do not show its fields for `apply_patch`. `tokenwise hook run` therefore reads `file_path`/`path` and any `*** Add File:` / `*** Update File:` / `*** Move to:` headers in string values; if none are found the hook stays silent.
- OpenAI Chat Completions `prompt_tokens_details.cached_tokens` being a subset of `prompt_tokens`: verified only for the Responses API (`input_tokens_details`); Chat Completions is assumed to follow the same convention.
- Claude Code transcript JSONL (`~/.claude/projects/<project>/<session>.jsonl`) is not a documented format. `tokenwise ingest` reads lines with `type: "assistant"`, `sessionId`, `requestId`, `isSidechain`, `agentId`, `timestamp` and `message.{id, model, usage}`, observed in local transcripts on 2026-10-31; repeated lines for the same `requestId` are deduplicated.

## Hooks and usage logs

Checked 2026-10-31.

| Topic | Fact relied on | Source |
|---|---|---|
| Claude Code hooks | Settings files `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`; shape `hooks.<Event>[] = {matcher, hooks: [{type: "command", command, timeout}]}`. PostToolUse matcher filters on `tool_name` (`Edit\|Write` is an exact-list matcher). Stdin JSON has `cwd`, `hook_event_name`, `tool_name`, `tool_input.file_path`. Exit 0 applies JSON on stdout; `hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext}` is added next to the tool result; other non-zero exits (not 2) are non-blocking. `timeout` in seconds, default 600 for command hooks. | https://code.claude.com/docs/en/hooks |
| Codex hooks | `~/.codex/hooks.json`, `<repo>/.codex/hooks.json` (or `[hooks]` in `config.toml`); project hooks load only when the project `.codex/` layer is trusted; enabled by default (`[features] hooks = false` disables). Same event → matcher group → handler shape; `apply_patch` matches `apply_patch`, `Edit` or `Write` and reports `tool_name: "apply_patch"`. PostToolUse stdin adds `tool_name`, `tool_input`, `tool_response`; `hookSpecificOutput.additionalContext` supported; `timeout` in seconds, default 600. | https://learn.chatgpt.com/docs/hooks (redirect from https://developers.openai.com/codex/hooks) |
| Anthropic usage | `input_tokens` counts only tokens not read from or written to cache; total input = `cache_read_input_tokens + cache_creation_input_tokens + input_tokens`. | https://platform.claude.com/docs/en/build-with-claude/prompt-caching |
| OpenAI usage | Responses API: `usage.input_tokens` includes `input_tokens_details.cached_tokens` and `cache_write_tokens` (ordinary input = input − cached − written). | https://developers.openai.com/api/docs/guides/prompt-caching |

## Model-calling APIs (used only by evals and AI-assisted optimization, behind I1)

Checked 2026-10-30.

| API | Fact relied on | Source |
|---|---|---|
| Anthropic Messages | `POST https://api.anthropic.com/v1/messages`; body `model`, `max_tokens`, `messages` (required), `system` (string); response `content[]` blocks with `type: "text"`, `usage.input_tokens`, `usage.output_tokens`. TokenWise sends `x-api-key` and `anthropic-version: 2023-06-01`, the same headers the token-counting page documents (the reference's example also shows a Bearer header and a newer version string). | https://platform.claude.com/docs/en/api/messages/create |
| OpenAI Chat Completions | `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`; body `model`, `messages`; `developer` role replaces `system` for o1 and newer; `max_tokens` deprecated in favor of `max_completion_tokens`; response `choices[0].message.content`, `usage.prompt_tokens`, `usage.completion_tokens`. Not deprecated; OpenAI recommends trying Responses for new projects. | https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create |
