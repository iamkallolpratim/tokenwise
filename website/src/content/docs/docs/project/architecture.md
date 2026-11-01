---
title: Architecture
description: How the TokenWise monorepo is organized, how data flows through it, and where each invariant is enforced.
---

After this page you will know where to find each part of TokenWise in the source and which tests guard it.

```text
apps/cli            Commander CLI, output renderers, consent prompts, exit codes
packages/shared     Zod schemas (config, findings), errors/exit codes, redaction (I5), path/text utils
packages/tokenizers Adapter interface; OpenAI (exact), Anthropic (estimated locally, provider_api via API), generic estimator
packages/core       discovery, classification, document model, rules, protected spans (I3), optimizer,
                    edits, diff, backup/restore, baseline/benchmark, evals, providers, usage ingest,
                    score, reports
packages/integrations  Claude Code / Codex skill targets, frontmatter validation, install, hook settings
skills/             _shared/references (source of truth) → generated references/ in each skill
```

The published `@klawde/tokenwise` package bundles the internal packages with tsup; third-party runtime dependencies (commander, zod, picocolors, fast-glob, ignore, diff, yaml, gpt-tokenizer) stay external. No native modules.

## Data flow

1. **Discovery** (`core/discovery.ts`): fast-glob over `include` minus `exclude`, then every `.gitignore` (scoped to its directory) and `.tokenwiseignore`. Secret-pattern files, binaries (NUL byte in the first 8 KB) and files over `maxFileSizeBytes` are skipped. Files are decoded with BOM detection (UTF-8, UTF-16LE/BE).
2. **Classification** (`core/classify.ts`): path signals plus content signals → a `FileCategory` and reasons. See D7 in [Decisions](../decisions/).
3. **Document model** (`core/document.ts`): line-based blocks (frontmatter, heading, paragraph, list, table, code, blockquote, html) and sections. Rules and fixes operate on whole lines.
4. **Rules** (`core/rules/*`): pure `detect(ctx)` functions returning draft findings; the engine assigns stable IDs and validates each finding against the Zod schema.
5. **Optimization** (`core/optimize.ts`): applies auto-fixable edits, re-audits until nothing is left to fix (idempotency), then runs the I3 check on the whole file. A failing file is rejected, never partially written.
6. **Apply** (`core/backup.ts`): verify the file has not changed since it was read, copy originals and a manifest into `.tokenwise/backups/<id>/`, then write each file via temp file + rename, preserving mode, BOM, encoding and line endings.

7. **Usage** (`core/usage.ts`, optional): `ingest` streams JSONL logs, keeps only token counts per request, and writes `.tokenwise/usage.json`; `audit` and `report` feed its stats to the agent-loop score dimension.
8. **Hooks** (`integrations/hooks.ts`, `cli/commands/hook.ts`, optional): `hook install` merges one PostToolUse entry into the harness settings file through `applyWithBackup`; `hook run` audits edited instruction files and prints hook JSON, read-only and time-bounded.

## Invariants and where they live

| Invariant | Enforcement | Tests |
|---|---|---|
| I1 egress consent | `apps/cli/src/consent.ts`; providers only constructed after consent | `tests/e2e/phase6.test.ts` network guard (preloaded `no-network.mjs` kills the CLI on any socket/DNS/fetch) |
| I2 non-destructive | `optimize` dry-run by default; `applyWithBackup`; `restore` | `tests/e2e/phase2.test.ts` |
| I3 protected content | `core/protect.ts` `checkPreservation` | `tests/unit/preservation.test.ts`, `tests/unit/score.test.ts` |
| I4 honest numbers | `TokenMethod` on every count, `basis` on every saving, `n/a` for missing data, "Quality: not verified" | `tests/unit/evals.test.ts`, `tests/e2e/phase5.test.ts` |
| I5 secrets | `shared/redact.ts` on all output paths; `isSecretFile` in discovery | `tests/unit/redact.test.ts` |
| I6 precision | heuristic rules have `fixable: false` | `tests/unit/rules.test.ts` |

## Extension points

- **Rule**: implement `Rule` in `core/rules/`, register it in `core/rules/all.ts`, add fixtures (see [Contributing](../contributing/)).
- **Tokenizer**: implement `TokenizerAdapter` and register it in `TokenizerRegistry`; model→encoding mappings are data in `tokenizers/src/models.ts`.
- **Model provider**: implement `ModelProvider` (`core/providers.ts`) or use the custom command provider.
