---
title: Usage logs
description: Import recorded token usage so the efficiency score reflects what your agents actually spent.
---

After this guide you can import Claude Code transcripts or API usage logs and read the agent-loop score.

Static analysis sees files; usage logs show what requests actually cost. `tokenwise ingest` reads JSON Lines files and keeps only the numbers.

## Import

```bash
tokenwise ingest ~/.claude/projects/<project>/<session>.jsonl   # Claude Code transcript
tokenwise ingest logs/responses.jsonl                            # one API response per line
tokenwise ingest a.jsonl b.jsonl --dry-run                       # summarize, write nothing
tokenwise ingest new.jsonl --replace                             # discard earlier imports first
```

Supported lines:

- **Claude Code transcripts:** `type: "assistant"` lines. Repeated lines for the same request are counted once; subagent (sidechain) requests are separate sessions. This format is not officially documented and may change.
- **Recorded API responses:** any JSON object with a `usage` object at the top level or under `response` or `body`, in Anthropic (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) or OpenAI (`prompt_tokens` / `input_tokens` with cached-token details) form. A `session_id`, `sessionId` or `conversation_id` groups requests into sessions.

Lines without usage are ignored; lines with negative or inconsistent numbers are counted as invalid and skipped.

## What is stored

`.tokenwise/usage.json` (file mode 0600) holds, per request: token counts, model ID, timestamp, and short SHA-256 hashes of the session and request IDs. Message content is never stored or printed. `ingest` refuses `.env*`, key and credential files even when named. `tokenwise init` adds the file to `.gitignore`.

## Effect on the score

`tokenwise audit` and `tokenwise report` use imported usage for the **agent-loop** dimension of the [efficiency score](../../concepts/efficiency-score/): the share of input on follow-up requests (every request after the first in a session) that was read from cache. It needs at least three follow-up requests; otherwise it stays `n/a`. Output efficiency still needs an evaluation run.
