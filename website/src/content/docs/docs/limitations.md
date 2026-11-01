---
title: Limitations
description: Known limits of TokenWise - false positives, what static analysis cannot see, and what is not verified.
---

After this page you will know where TokenWise can be wrong and how to check it.

## Heuristic rules can be wrong

Near-duplicates ([RED-003](../reference/rules/#red-003)), filler and preambles ([VERB-001](../reference/rules/#verb-001), [VERB-002](../reference/rules/#verb-002)), contradictions ([SEC-002](../reference/rules/#sec-002)), and the RAG and LOOP rules use heuristics. They are labeled with confidence, never auto-fixed, and you can disable any of them in `rules.disabled`. Common false positives:

- RED-003: two paragraphs that differ in one word that matters ("before" versus "after").
- VERB-001: a phrase that looks like filler but sets tone on purpose.
- SEC-002: a MUST / MUST NOT pair separated by a condition elsewhere in the file.
- RAG-001: a large `top_k` that your reranker narrows down.
- LOOP rules: loops whose cap lives in code the regex-based check does not follow.

## Static analysis cannot see runtime

TokenWise reads files. It does not see which files a harness actually loads in a given session, what tools your agent offers per request, or how often a loop runs. [Usage logs](../guides/usage-logs/) add some runtime evidence (token counts and cache use), not behavior.

## Counts

- Claude counts are `estimated` unless you use the [provider API](../concepts/token-counting/). The estimator's error against Claude's tokenizers is unknown.
- Counts are text-only; harness overhead (message framing, tool definitions added at runtime) is not included.

## Quality is not verified by default

Removing an exact duplicate is safe by construction, but TokenWise cannot know whether a shorter prompt behaves the same. Only an [evaluation suite](../guides/benchmarking-and-evals/) can show that.

## Formats

- The Claude Code transcript format read by `ingest` is undocumented and may change.
- How Codex loads a skill's `references/` folder, and the input it passes to `apply_patch` hooks, are not documented; see [Sources](../project/sources/).
- Only JS/TS and Python source is checked by the LOOP and CACHE rules.
- Cursor rules, Copilot instructions and other harness formats are not yet recognized specifically; see the [roadmap](../roadmap/).

## Platforms

The test suite runs in CI on Linux, macOS and Windows with Node.js 26. Other Node.js versions are not supported (`engines: >=26`).
