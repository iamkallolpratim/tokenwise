---
title: Benchmarking and evals
description: Measure token savings against a baseline and check behavior with an evaluation suite.
---

After this guide you can prove how many tokens a change saved and whether the agent still behaves as required.

## Baseline and compare

```bash
tokenwise benchmark --save-baseline --model gpt-5   # writes .tokenwise/baseline.json
# ...edit files, or: tokenwise optimize --apply
tokenwise benchmark --model gpt-5
```

The baseline stores, per file, a content hash, the token count with its method, and the finding IDs. `benchmark` then reports input tokens before and after (per file and total), the percentage change, files changed, and findings resolved and introduced. Savings here are **measured**.

Use the same `--model` for both runs; counts from different tokenizers are not comparable, and the output says so. `--baseline <file>` compares against another baseline file.

A cost difference appears only if you add prices for the model:

```json
{ "version": 1, "pricing": { "gpt-5": { "inputPerMillion": 1.25, "outputPerMillion": 10 } } }
```

Use your own prices; TokenWise ships none.

## Evaluation suites

Token counts cannot tell you whether a shorter prompt still works. An evaluation suite can. Put suites in `.tokenwise/evals/*.yaml`:

```yaml
name: support
system: prompts/support-system.md   # file under test, sent as the system prompt
model: claude-sonnet-5-5             # or --eval-model / --model / defaultModel
maxOutputTokens: 512
cases:
  - id: big-refund
    input: "I want a refund of $600."
    criteria:
      - contains: "human agent"
      - not_contains: "approved"
      - regex: "^\\{"
      - json_schema: { type: object, required: [answer, escalate] }
      - script: ./check-refund.mjs   # receives the output on stdin; exit 0 = pass
```

`json_schema` supports a subset of JSON Schema (`type`, `required`, `properties`, `additionalProperties`, `enum`, `const`, `items`, min/max, `minLength`/`maxLength`); an unsupported keyword fails the criterion rather than passing silently.

Running a suite calls a model, so it needs the same consent as any external call: `privacy.externalModelCalls: true` in config, `--allow-external`, and a confirmation (or `--yes` when not in a terminal). See [Privacy](../../privacy/).

```bash
tokenwise benchmark --save-baseline --eval --allow-external
tokenwise optimize --apply
tokenwise benchmark --eval --allow-external
```

## Reading the result

| Status | Meaning |
|---|---|
| `awaiting validation` (Quality: not verified) | No evaluation ran on both the baseline and the current state, or the eval model or number of cases changed. The default. |
| `validated` (Quality: preserved) | The current run passed at least as many cases as the baseline's run, with the same model and number of cases. |
| `regressed` | Fewer cases passed than in the baseline run. |

Output tokens are reported only from evaluation runs; without one they are `n/a`.
