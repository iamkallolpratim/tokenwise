---
title: Safety guarantees
description: What TokenWise guarantees about your files and data, and the code and tests that enforce each guarantee.
---

After this page you will know exactly what TokenWise will and will not do to your repository.

## Nothing changes without --apply

`optimize`, `install-skill` and `hook install` are dry runs by default and print what they would do. With `--apply`:

- every changed file is backed up to `.tokenwise/backups/<id>/` with a manifest of hashes;
- writes are atomic (temporary file, then rename) and keep file mode, BOM, encoding and line endings;
- if a file changed on disk since it was read, nothing is written;
- `tokenwise restore <id>` puts the original bytes back, and refuses (unless `--force`) if you edited the file afterwards.

Tested in `tests/e2e/phase2.test.ts`: dry run leaves bytes untouched, apply then restore round-trips byte for byte, CRLF/BOM/mode are preserved.

## Protected content

Before any transformation TokenWise extracts protected spans: sentences with negations or exceptions, normative keywords (must, never, always…), security, privacy and approval language, output-format requirements, fenced and inline code, URLs, endpoints, paths, identifiers, citations, and JSON/YAML keys. After the transformation each span's occurrence count must be unchanged, or reduced only by a declared exact-duplicate deletion that leaves at least one copy in the same section. Any violation rejects the whole file.

Tested in `tests/unit/preservation.test.ts` with table-driven fixtures, including a deliberately broken transformation that must be rejected.

## Heuristics are never applied automatically

Only exact, structural fixes are auto-fixable (exact duplicates, whitespace). Near-duplicates, filler, contradictions, context moves, tool, RAG and loop findings are recommendations. Tested in `tests/unit/rules.test.ts`.

## Honest numbers

Every count is labeled `exact`, `provider_api` or `estimated`; every saving `measured`, `estimated` or `potential`. Missing values print `n/a`. Without an evaluation, results say "Quality: not verified". See [Token counting](../token-counting/).

## Local-first

No network access unless config, flag and confirmation all allow it, and no telemetry. Every command in the end-to-end tests runs with a preloaded guard that fails the test on any socket, DNS lookup or `fetch`. See [Privacy](../../privacy/).

## Secrets

Secret-like strings are redacted from terminal output, JSON, reports, the audit cache and anything sent externally. Secret files are not read unless named explicitly. Tested in `tests/unit/redact.test.ts`.
