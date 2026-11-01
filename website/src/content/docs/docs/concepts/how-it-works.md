---
title: How it works
description: The path from discovery to an applied change - classification, rules, protected content, diffs and backups.
---

After this page you will know what TokenWise does with your files at each step, and where it can refuse to act.

## 1. Discovery

TokenWise globs `include` minus `exclude`, then applies every `.gitignore` (scoped to its directory) and `.tokenwiseignore`. It skips files matching secret patterns, binaries (a NUL byte in the first 8 KB) and files over `maxFileSizeBytes`. Text is decoded with BOM detection (UTF-8, UTF-16LE/BE).

## 2. Classification

Each candidate gets a category from path and content signals: `agent-instructions`, `skill`, `subagent`, `prompt-template`, `tool-schema`, `agent-config`, `rag-config` or `other-relevant`. Strong path signals classify on their own; weaker ones need model-addressed content. Ordinary docs, READMEs and lockfiles are not prompts. `tokenwise scan --verbose` shows the reasons. Source files that call a model are collected separately for the LOOP and CACHE rules.

## 3. Document model

Markdown is split into line-based blocks (frontmatter, headings, paragraphs, lists, tables, code, quotes) and sections. JSON and YAML are parsed. Rules and fixes operate on whole lines, which keeps diffs readable.

## 4. Rules

Each [rule](../../reference/rules/) reads the files and returns findings: location, evidence (secrets redacted), estimated savings with basis and confidence, risk, recommendation, and whether it is auto-fixable. Finding IDs hash the rule, file and content, so they stay the same across runs and unrelated edits.

## 5. Optimization

`tokenwise optimize` applies the auto-fixable edits, re-audits until nothing fixable is left (so a second run changes nothing), then checks the whole file for [protected content](../safety-guarantees/#protected-content). If any protected span would be removed or altered, the file is rejected and left as it was. The result is a unified diff and a before/after token table.

## 6. Apply

With `--apply`, TokenWise first checks that no file changed since it was read. It then copies the original bytes and a manifest into `.tokenwise/backups/<id>/` and writes each file through a temporary file and rename. File mode, BOM, encoding and line endings are preserved. `tokenwise restore <id>` writes the originals back, after backing up the current state, so a restore can itself be undone.

## 7. Measurement

[Benchmarks](../../guides/benchmarking-and-evals/) compare against a saved baseline; [usage logs](../../guides/usage-logs/) add runtime evidence; the [efficiency score](../efficiency-score/) summarizes what the evidence supports.
