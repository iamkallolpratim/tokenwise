---
title: Privacy
description: What runs locally, the only ways content can leave your machine, and what TokenWise writes to disk.
---

After this page you will know when, and only when, TokenWise sends anything off your machine.

## Defaults

- No network requests. No telemetry: the config schema accepts only `"telemetry": false`.
- Files matching `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keychain`, `credentials*`, `id_rsa*`, `.netrc`, `.npmrc`, `.pypirc` or `secrets.{json,yaml,toml}` are not read unless you name the file as the target or list its literal path in `include`.
- `.gitignore` files (in every directory) and `.tokenwiseignore` are honored.

## When content can leave the machine

Three features send content to a model provider:

- `tokenwise tokens --allow-external` (Anthropic token counting),
- `tokenwise benchmark --eval` (evaluation runs),
- `tokenwise optimize --mode ai` (AI-assisted rewriting).

Each requires **all** of:

1. `"privacy": { "externalModelCalls": true }` in a config file. Environment variables cannot set it.
2. The `--allow-external` flag on that run.
3. A confirmation that lists every file and its approximate token count, or `--yes` when stdin is not a terminal.

Without all three, the command exits with code 4 and sends nothing. Content is redacted before sending; in AI mode, files that contain secret-like strings are not sent at all.

A custom provider (`providers.custom.command`) runs a local command, but TokenWise cannot know where that command sends data, so it is gated the same way.

## Secrets

Known credential formats (Anthropic, OpenAI, AWS, GitHub, Slack, Google, Stripe, JWT, private keys, `api_key = "…"` assignments) and high-entropy tokens are redacted from terminal output, JSON, reports, the audit cache and anything sent externally. [SEC-001](../reference/rules/#sec-001) reports where a secret was found without printing it. API keys are read only from `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; `tokenwise config set` refuses values that look like keys. Prompts, responses and keys are never logged.

## What TokenWise writes

- `tokenwise.config.json`, only through `init` or `config set`.
- `.tokenwise/cache/` (audit findings, last evaluation run) and `.tokenwise/baseline.json`.
- `.tokenwise/backups/`: original bytes of files you changed. Keep it out of version control; `init` adds it to `.gitignore`.
- `.tokenwise/usage.json`, only through `ingest` (mode 0600): token counts, model IDs, timestamps and hashed session/request IDs. Never message content.
- Hook settings, only through `hook install --apply`, with a backup. `tokenwise hook run` writes nothing.

## This website

This site uses no analytics, no cookies, no tracking pixels and no third-party fonts or scripts. Search runs in your browser on a static index. The theme choice is kept in your browser's local storage.
