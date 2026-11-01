---
title: Introduction
description: What TokenWise is, what it does and does not do, and where to start.
---

After reading this page you will know what TokenWise can do for your repository and which page to read next.

TokenWise is a command-line tool that finds unnecessary LLM token usage in the files AI agents read: agent instruction files (`CLAUDE.md`, `AGENTS.md`), skills, subagents, prompt templates, tool schemas, and agent and retrieval configuration. It reports where tokens are wasted, explains the risk of each change, and applies only the fixes it can prove are safe.

It runs on your machine. By default it makes no network requests and sends no telemetry.

## What it answers

| Question | Command |
|---|---|
| Which files do my agents read, and how big are they? | `tokenwise scan` |
| Where are tokens wasted? | `tokenwise audit` |
| What can be removed safely, and what would change? | `tokenwise optimize` (a diff; nothing is written) |
| How much did I actually save? | `tokenwise benchmark` against a saved baseline |
| Did the change keep the behavior I need? | `tokenwise benchmark --eval` with your evaluation suite |

## What it does

- Discovers AI-relevant files and counts their tokens, labeling every count `exact`, `provider_api` or `estimated`.
- Runs [25 rules](reference/rules/) for duplication, verbosity, oversized context, tool schemas, retrieval settings, agent loops, secrets and contradictions.
- Applies only deterministic fixes (exact duplicates, whitespace), after checking that every [protected statement](concepts/safety-guarantees/) survives, with a diff first, a backup, and `tokenwise restore`.
- Installs [Claude Code](agent-skills/claude-code/) and [Codex](agent-skills/codex/) skills that drive the CLI.

## What it does not do

- Send anything off your machine unless you allow it in config, pass `--allow-external` and confirm. See [Privacy](privacy/).
- Rewrite instructions by meaning in its default mode. AI-assisted rewriting is opt-in, and every proposal is checked and labeled.
- Claim savings or quality it has not measured. Unknown values print as `n/a`, and results say "Quality: not verified" until you run an evaluation. See [Limitations](limitations/).

## Commands in these docs

Examples write the command as `tokenwise`. If you run it without installing, use `npx @klawde91/tokenwise` in its place. See [Installation](getting-started/installation/).

## Next

- [Install TokenWise](getting-started/installation/), then follow the [quickstart](getting-started/quickstart/).
- Optimizing a specific file type: [CLAUDE.md](guides/optimizing-claude-md/), [AGENTS.md](guides/optimizing-agents-md/), [tool schemas](guides/tool-schemas/).
