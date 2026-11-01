---
title: Using in CI
description: Fail a build on new high-severity findings, publish reports, and read exit codes.
---

After this guide you can run TokenWise in a pipeline and fail the build when instruction files regress.

## Fail on findings

```bash
tokenwise audit --fail-on high --model gpt-5
```

Exits with code **1** if any finding is at or above the level (`critical`, `high`, `medium` or `low`), and **0** otherwise. Other [exit codes](../../reference/exit-codes/) mean a usage error (2), a runtime error (3) or missing consent (4).

`--fail-on` looks at all findings, even when `--severity` hides some from the output. Exclude rules you have accepted with `--exclude-rule <id...>` or `rules.disabled` in config.

## Machine-readable output

`--format json` prints only JSON on stdout (logs go to stderr), so it can be piped:

```bash
tokenwise audit --format json --model gpt-5 > tokenwise-audit.json
tokenwise report --format json --out tokenwise-report.json
tokenwise report --format markdown --out tokenwise-report.md
```

Finding IDs are stable across runs (they hash the rule, file and content, not line numbers), so you can diff two audits. The report follows a [versioned schema](../../reference/report-format/).

## GitHub Actions example

```yaml
name: tokenwise
on: pull_request
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 26
      - run: npx @klawde91/tokenwise audit --fail-on high --model gpt-5
      - if: always()
        run: npx @klawde91/tokenwise report --format markdown --out tokenwise-report.md
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tokenwise-report
          path: tokenwise-report.md
```

No secrets are needed: by default TokenWise makes no network requests. If you run evaluation suites in CI, the job needs `privacy.externalModelCalls: true` in the committed config, `--allow-external --yes`, and the provider key as a secret environment variable.
