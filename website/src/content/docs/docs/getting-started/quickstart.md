---
title: Quickstart
description: Go from install to a report on your own repository in five commands.
---

After this page you will have audited a repository, previewed safe fixes and written a report.

Run these from your repository root. Nothing is modified until step 5, and step 5 is optional.

## 1. Create a config

```bash
npx @klawde/tokenwise init
```

Writes `tokenwise.config.json`, creates `.tokenwise/`, adds `.tokenwise/backups/` and `.tokenwise/usage.json` to an existing `.gitignore`, and lists the Claude Code and Codex files it found. The defaults are fine to start with; see [Configuration](../configuration/).

## 2. See what agents read

```bash
npx @klawde/tokenwise scan --model gpt-5
```

Lists each AI-relevant file with its category and token count. `--model` picks the tokenizer. With an OpenAI model the count is `exact`; without `--model` (or with a Claude model) it is `estimated`. See [Token counting](../../concepts/token-counting/).

## 3. Audit

```bash
npx @klawde/tokenwise audit --model gpt-5
```

Prints findings grouped by severity. Each has a location, evidence, estimated savings with its basis, the risk of changing it, and a recommendation. `--verbose` shows full recommendations; `--severity high` shows only HIGH and CRITICAL. The [rules reference](../../reference/rules/) explains each rule ID.

## 4. Preview fixes

```bash
npx @klawde/tokenwise optimize --model gpt-5
```

Shows a unified diff of the deterministic fixes (exact duplicates, whitespace) and a table of tokens before and after. This is a dry run: nothing is written. Findings that need judgment are listed as recommendations and never applied.

## 5. Apply and measure (optional)

```bash
npx @klawde/tokenwise benchmark --save-baseline --model gpt-5
npx @klawde/tokenwise optimize --apply --model gpt-5
npx @klawde/tokenwise benchmark --model gpt-5
```

`--apply` backs up every file it changes into `.tokenwise/backups/<id>/` before writing. Undo with:

```bash
npx @klawde/tokenwise restore --list
npx @klawde/tokenwise restore <id>
```

`benchmark` compares the current files with the baseline. It reports "Quality: not verified" until you add an [evaluation suite](../../guides/benchmarking-and-evals/).

## 6. Write a report

```bash
npx @klawde/tokenwise report --format html --out tokenwise-report.html
```

A single self-contained HTML file. `--format json` gives the [versioned JSON report](../../reference/report-format/); `--format markdown` is good for pull requests.

## Next

- Tune thresholds and rules: [Configuration](../configuration/)
- Use it in CI: [Using in CI](../../guides/using-in-ci/)
- Let your agent drive it: [Claude Code](../../agent-skills/claude-code/), [Codex](../../agent-skills/codex/)
