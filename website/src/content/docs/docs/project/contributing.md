---
title: Contributing
description: Set up the repository, run the checks, and add rules, tokenizer adapters, model providers or documentation.
---

After this page you can make a change to TokenWise and get it through the same checks CI runs.

## Setup

Requires Node.js 26+ and pnpm 9.

```bash
pnpm install
pnpm gate        # typecheck, lint, build, all tests
pnpm gate:linux  # the same gate in a clean Linux container (needs Docker)
pnpm sync-skills # after editing skills/_shared/references
```

## Adding a rule

1. Implement `Rule` (`packages/core/src/rules/types.ts`) in the matching file under `packages/core/src/rules/`. `detect` must be pure: read the context, return draft findings. Fill in `description` and `method`; both are published on the [rules reference](../../reference/rules/).
2. Register it in `packages/core/src/rules/all.ts`.
3. Add fixtures: `tests/fixtures/rules/<RULE-ID>/positive/` (must fire) and `negative/` (must stay silent, and must not trigger any other rule at HIGH or CRITICAL). The rule tests fail if a registered rule has no fixtures, and the website build fails if the positive fixture produces no finding: it is the rule's published example.
4. Heuristic rules: `fixable: false`, default severity MEDIUM or LOW, and a `risk` that says what a wrong fix would break. Only exact, structural edits may be auto-fixable, and they must pass `checkPreservation`.
5. Pass an `idKey` when evidence contains numbers or line references that change after unrelated edits, so finding IDs stay stable.
6. Update `skills/_shared/references/optimization-rules.md` and run `pnpm sync-skills`.

## Adding a tokenizer adapter

Implement `TokenizerAdapter` in `packages/tokenizers/src/`, put model-to-encoding mappings in `models.ts` as data, and register the adapter in `TokenizerRegistry`. Label counts `exact` only when the tokenizer is the provider's own for that model. Add calibration or mapping tests, and update [Token counting](../../concepts/token-counting/).

## Adding a model provider

Implement `ModelProvider` in `packages/core/src/providers.ts` and route to it from `providerFor`. Read keys only from environment variables, never log requests or responses, and make sure every caller goes through `requireEgressConsent`. Users can also plug in any provider without code through `providers.custom.command` (JSON request on stdin; `{ "text", "inputTokens", "outputTokens" }` on stdout).

## Tests

- Unit tests in `tests/unit/`; end-to-end tests that spawn the CLI in `tests/e2e/`. Every spawned CLI preloads `tests/helpers/no-network.mjs`, which fails the test on any network access.
- Golden reports in `tests/e2e/__snapshots__/`; update with `npx vitest run tests/e2e/phase5.test.ts -u` and review the diff.
- Performance: `node scripts/perf.mjs 5000`.

## Documentation

All documentation lives in this website, under `website/src/content/docs/docs/`. The CLI, rules, config and report reference pages are generated from code by `website/scripts/generate.ts`; edit the code, not those pages.

```bash
pnpm --filter website dev     # local site with live reload
pnpm --filter website build   # generators, demo capture, static build
pnpm --filter website check   # links, commands and config keys in prose, privacy of the build
```

Links between pages are relative (`../quickstart/`), so the site works under any base path. Every `tokenwise …` command and config key written in the docs is checked against the CLI and schema. See `website/README.md` for deployment.
