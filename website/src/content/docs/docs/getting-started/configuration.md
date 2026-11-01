---
title: Configuration
description: Where TokenWise reads configuration from, how values combine, and the keys you are most likely to change.
---

After reading this page you will know how to change thresholds, disable rules and select a default model.

Every key, its type and default is listed in the generated [config schema](../../reference/config-schema/).

## Files and precedence

Values are merged in this order, later sources overriding earlier ones:

1. Built-in defaults.
2. User config: `~/.config/tokenwise/config.json` (or `$XDG_CONFIG_HOME/tokenwise/config.json`; `TOKENWISE_USER_CONFIG` names another file).
3. Project config: `tokenwise.config.json` in the working directory, or the file passed with `--config <path>`.
4. Environment variables (below).
5. Command-line flags, such as `--model`.

Objects merge key by key; arrays and scalars replace. Unknown keys are an error (exit code 2), and the message names the field.

Inspect the result with:

```bash
tokenwise config show
tokenwise config get thresholds.rootInstructionTokens
tokenwise config set thresholds.rootInstructionTokens 3000
```

`config show` prints the effective configuration and which file each layer came from. `config set` writes `tokenwise.config.json` and validates it first. It refuses values that look like API keys.

## Environment variables

| Variable | Effect |
|---|---|
| `TOKENWISE_MODEL` | Same as `defaultModel`. |
| `TOKENWISE_MAX_FILE_SIZE` | Same as `maxFileSizeBytes`. |
| `TOKENWISE_USER_CONFIG` | Path of the user config file. |
| `TOKENWISE_DOCS_URL` | Base URL for the rule links in `audit` output. Defaults to the package's homepage; set it to an empty string to print no links. |
| `NO_COLOR` / `FORCE_COLOR` | Disable or force colored output. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Read only by features that call a provider, after consent. Never written to config. |

`privacy.externalModelCalls` **cannot** be set from the environment; it must be in a config file. See [Privacy](../../privacy/).

## Common changes

Default model, so you can drop `--model`:

```json
{ "version": 1, "defaultModel": "gpt-5" }
```

Disable a rule:

```json
{ "version": 1, "rules": { "disabled": ["VERB-001"] } }
```

Raise the size threshold for root instruction files:

```json
{ "version": 1, "thresholds": { "rootInstructionTokens": 3000 } }
```

Skip generated folders (in addition to every `.gitignore` and `.tokenwiseignore`):

```json
{ "version": 1, "exclude": ["node_modules/**", "dist/**", "generated/**"] }
```

`exclude` replaces the default list, so repeat the defaults you still want.

## What gets scanned

`include` (Markdown, text, JSON and YAML by default) selects candidates; each is then classified by path and content. Strong path signals (`CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `.claude/**`, `.agents/**`, `prompts/**`) are enough on their own. Other files need content that addresses a model. READMEs, changelogs, lockfiles and `package.json` are never treated as prompts. Run `tokenwise scan --verbose` to see why each file was included.

Files matching secret patterns (`.env*`, `*.pem`, `*.key`, credentials files and similar) are never read unless you name one explicitly. See [Privacy](../../privacy/).
