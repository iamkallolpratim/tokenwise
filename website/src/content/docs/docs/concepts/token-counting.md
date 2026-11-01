---
title: Token counting
description: When TokenWise counts tokens exactly, when it asks a provider, and when it estimates - and how accurate the estimate is.
---

After this page you can tell how far to trust any token count TokenWise prints.

Every count carries a method:

| Method | Meaning |
|---|---|
| `exact` | Counted locally with the model provider's own tokenizer. |
| `provider_api` | Counted by the provider's token-counting API. |
| `estimated` | Counted with TokenWise's generic estimator. |

One provider's tokenizer is never used to label another provider's counts as exact.

## By model

| Model | Method | How |
|---|---|---|
| In tiktoken's model table (`gpt-5*`, `gpt-4.1*`, `gpt-4o*`, `o1`/`o3`/`o4-mini`, `gpt-4`, `gpt-3.5-turbo`, `gpt-oss`) | `exact` | gpt-tokenizer with `o200k_base`, `o200k_harmony` or `cl100k_base` |
| `claude-*` | `estimated` | No official offline tokenizer exists for current Claude models |
| `claude-*` with `tokens --allow-external` | `provider_api` | Anthropic's `count_tokens` endpoint (counts a full request) |
| Anything else, or no model | `estimated` | Generic estimator, with a warning naming the fallback |

Counting with the Anthropic API sends file content to Anthropic, so it needs [consent](../../privacy/):

```bash
tokenwise tokens --model claude-sonnet-5-5 --allow-external
```

## Text versus full request

Local counts have `scope: "text"`: the file's text only. A harness adds message framing, tool definitions and system prompts at runtime, which these counts do not include. Provider API counts have `scope: "full_request"`.

## Generic estimator accuracy

The estimator was calibrated against `o200k_base`. Its weights were fitted on the fixture corpus, so corpus errors are optimistic; the sample project was held out.

| Text | o200k_base | Estimate | Error |
|---|---:|---:|---:|
| corpus: English prose | 155 | 157 | +1.3% |
| corpus: TypeScript | 212 | 219 | +3.3% |
| corpus: JSON | 205 | 206 | +0.5% |
| corpus: Markdown | 174 | 170 | −2.3% |
| corpus: CJK | 82 | 78 | −4.9% |
| corpus: emoji | 58 | 56 | −3.4% |
| held out: sample CLAUDE.md | 2,123 | 2,044 | −3.7% |
| held out: sample prompt file | 152 | 127 | −16.4% |
| held out: sample RAG YAML | 48 | 36 | −25.0% |
| held out: sample tools.json | 628 | 749 | +19.3% |
| held out: sample total (8 files) | 3,452 | 3,453 | 0.0% |

Measured 2026-10-30. Expect roughly ±5% on long prose and up to ±25% on small or structured files. Error against Claude's tokenizers is unknown (Anthropic documents that its newer tokenizers produce about 30% more tokens than earlier Claude models); use `provider_api` counts when the number matters.

## Savings labels

- **measured**: before and after counts of an applied change (`optimize --apply`, `benchmark` against a baseline).
- **estimated**: tokens of the text an auto-fix would remove, counted before applying.
- **potential**: an upper bound if a recommendation were followed in full. Potential savings overlap and are not additive.
