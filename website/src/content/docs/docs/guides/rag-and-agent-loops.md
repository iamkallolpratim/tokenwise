---
title: RAG and agent loops
description: Check retrieval settings and model-calling loops for token waste, and know what static analysis cannot see.
---

After this guide you can read RAG, LOOP and CACHE findings and decide which ones apply to your system.

These rules read configuration and source code. They cannot observe your system at runtime, so every finding is a **recommendation** with low confidence and a note on what would confirm it.

## Retrieval configuration

TokenWise reads YAML or JSON retrieval settings (keys like `top_k`, `chunk_size`, `chunk_overlap`, filters, rerank).

| Rule | Fires when |
|---|---|
| [RAG-001](../../reference/rules/#rag-001) | `top_k` (or similar) is above `thresholds.ragTopK` (10) |
| [RAG-002](../../reference/rules/#rag-002) | No metadata filter keys |
| [RAG-003](../../reference/rules/#rag-003) | Reranking is absent or disabled |
| [RAG-004](../../reference/rules/#rag-004) | Chunk overlap is at least 25% of chunk size |

More retrieved text is not always waste: a lower `top_k` can drop the passage that answers the question. Change one setting at a time and measure answer quality.

## Agent loops in source code

JS/TS and Python files that call a model (matched by `codeInclude`) are checked with regex-based static analysis, not a full parser.

| Rule | Looks for |
|---|---|
| [LOOP-001](../../reference/rules/#loop-001) | `while (true)`, `for (;;)`, `do {}`, `while True:` loops that call a model with no iteration cap |
| [LOOP-002](../../reference/rules/#loop-002) | Retry loops around a model call with no maximum |
| [LOOP-003](../../reference/rules/#loop-003) | A loop that re-sends the same prompt and context every iteration |
| [CACHE-001](../../reference/rules/#cache-001) | The same constant system prompt sent from several call sites or a loop |

CACHE-001's recommendation separates three things: provider prompt caching (cheaper reprocessing of the same prefix, same context size), semantic response caching (a quality risk), and caching your own results.

## Confirm with runtime data

Import usage logs to see what your loops actually cost; the agent-loop score then uses real numbers. See [Usage logs](../usage-logs/).
