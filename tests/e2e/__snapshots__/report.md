# TokenWise report

Generated 2026-10-30T09:12:00.000Z by tokenwise 0.1.1 for `.`.

## Summary

- Files analyzed: 8 (+2 source files with model calls)
- Tokens: 3,337 (**estimated**). Estimated with TokenWise's generic estimator (no model selected); see "Token counting" in the TokenWise docs for its error range.
- Token Efficiency Score: **50** (2 open CRITICAL finding(s) (SEC-002, SEC-001) cap the score at 50)
- Quality: not verified

## Score breakdown

| Dimension | Weight | Score | Why |
|---|---|---|---|
| Prompt efficiency | 20% | 67 | 277 tokens of redundancy/verbosity findings in 2552 prose tokens (10.9%); score = 100 × (1 − 3 × ratio). |
| Context efficiency | 25% | 71 | 2133 always-loaded tokens vs threshold 2000 (base 94), minus 23 for 3 context finding(s). |
| Tool efficiency | 20% | 60 | 4 tool finding(s) across 1 tool file(s); 100 − 40. |
| Output efficiency | 15% | n/a | n/a: requires an eval run (tokenwise benchmark --eval). |
| Agent-loop efficiency | 20% | n/a | n/a: requires runtime usage data (tokenwise ingest <usage.jsonl>); 2 static LOOP finding(s) lower confidence but are not scored. |

Weights renormalized over 3 of 5 dimensions with evidence (65% of total weight).

## Savings

| Basis | Tokens |
|---|---|
| Measured | 116 |
| Estimated | 0 |
| Potential | 1,586 |

Measured = before/after counts against a baseline. Estimated = size of text an auto-fix would remove. Potential = upper bound if a recommendation is followed; not additive across overlapping findings.

## Top opportunities

| Rule | Location | Tokens | Basis | Auto-fix | Finding |
|---|---|---|---|---|---|
| CTX-002 | `CLAUDE.md:56` | 915 | potential | no | Embedded log of 915 tokens (estimated) in an always-loaded file. |
| TOOL-003 | `tools/tools.json:4` | 167 | potential | no | Tool "get_order" description carries 3 inline example(s) (~238 tokens, estimated). |
| TOOL-001 | `tools/tools.json:4` | 130 | potential | no | Tool "get_order" definition is 430 tokens (estimated); threshold 300. Its description alone is 301. |
| RED-004 | `CLAUDE.md:18` | 128 | potential | no | 2 block(s) are duplicated between AGENTS.md and CLAUDE.md. |
| CTX-003 | `.claude/agents/reviewer.md:6` | 55 | potential | no | Background paragraph repeated in 2 definitions: .claude/agents/reviewer.md, .claude/agents/tester.md. |
| VERB-002 | `CLAUDE.md:3` | 42 | potential | no | Opening paragraph is social text with no instruction or constraint. |
| RED-003 | `CLAUDE.md:48` | 42 | potential | no | Paragraph is 90% similar (5-shingle Jaccard) to line 46. |
| VERB-002 | `CLAUDE.md:116` | 29 | potential | no | Closing paragraph is social text with no instruction or constraint. |
| TOOL-002 | `tools/tools.json:4` | 28 | potential | no | Same description text appears 3 times: get_order.order_id (required), list_orders.customer_id (required), cancel_order.order_id (required). |
| VERB-001 | `CLAUDE.md:116` | 21 | potential | no | Filler phrase(s): "thanks again", "let us know if you have any questions", "have a wonderful day", "we look forward to working with you". |

## Findings by severity

### CRITICAL (2)

- **SEC-002** `AGENTS.md:17` — Contradiction: line 15 requires "You MUST pin dependency versions in package.json." but line 17 forbids it. _Risk:_ The model may follow either instruction. Low confidence: a qualifier elsewhere may resolve it.
- **SEC-001** `prompts/support-system.md:12` — Possible anthropic-api-key in a file that is sent to models. _Risk:_ Anything in a prompt file is sent to the model provider and may appear in logs or outputs.

### MEDIUM (9)

- **CTX-003** `.claude/agents/reviewer.md:6` — Background paragraph repeated in 2 definitions: .claude/agents/reviewer.md, .claude/agents/tester.md. _Risk:_ Each subagent starts with its own context; removing shared background may leave one without facts it needs.
- **RED-004** `CLAUDE.md:18` — 2 block(s) are duplicated between AGENTS.md and CLAUDE.md. _Risk:_ Copies drift apart over time, and agents that load both files pay for the same text twice.
- **CTX-002** `CLAUDE.md:56` — Embedded log of 915 tokens (estimated) in an always-loaded file. _Risk:_ If the agent needs this data for a task, it must be able to find it on demand.
- **RAG-001** `rag/retrieval.yaml:4` — top_k: 50 retrieves more than 10 chunks per query (up to ~40,000 characters at chunk_size 800). _Risk:_ Fewer chunks can drop the passage that answers the question; measure recall before lowering it.
- **RAG-004** `rag/retrieval.yaml:6` — chunk_overlap 400 is 50% of chunk_size 800; adjacent retrieved chunks repeat that much text. _Risk:_ Too little overlap can split a fact across chunks.
- **LOOP-001** `src/agent.ts:5` — `while (true)` calls a model and stops only when the model says so; there is no iteration cap. _Risk:_ A cap that is too low cuts off long tasks; pick it from observed turn counts.
- **LOOP-002** `src/agent.ts:13` — `for (;;)` retries a failed model call with no maximum. _Risk:_ Without a cap, a persistent error (bad request, revoked key) repeats the full prompt indefinitely.
- **TOOL-001** `tools/tools.json:4` — Tool "get_order" definition is 430 tokens (estimated); threshold 300. Its description alone is 301. _Risk:_ Tool definitions are sent with every request that offers the tool; trimming the wrong detail makes the model call it wrongly.
- **TOOL-003** `tools/tools.json:4` — Tool "get_order" description carries 3 inline example(s) (~238 tokens, estimated). _Risk:_ Examples can teach argument formats; keep one minimal example if calls fail without it.

### LOW (11)

- **VERB-001** `CLAUDE.md:3` — Filler phrase(s): "thank you so much", "we really appreciate", "we hope you enjoy". _Risk:_ Low, but rewording is a judgment call: some phrases soften or emphasize an instruction on purpose.
- **VERB-002** `CLAUDE.md:3` — Opening paragraph is social text with no instruction or constraint. _Risk:_ Low: the paragraph contains no instruction, but check it does not set tone the agent should keep.
- **VERB-001** `CLAUDE.md:11` — Filler phrase(s): "please make sure to". _Risk:_ Low, but rewording is a judgment call: some phrases soften or emphasize an instruction on purpose.
- **RED-003** `CLAUDE.md:48` — Paragraph is 90% similar (5-shingle Jaccard) to line 46. _Risk:_ Medium: near-duplicates often differ in a detail that matters (a value, a negation, a scope).
- **VERB-001** `CLAUDE.md:116` — Filler phrase(s): "thanks again", "let us know if you have any questions", "have a wonderful day", "we look forward to working with you". _Risk:_ Low, but rewording is a judgment call: some phrases soften or emphasize an instruction on purpose.
- **VERB-002** `CLAUDE.md:116` — Closing paragraph is social text with no instruction or constraint. _Risk:_ Low: the paragraph contains no instruction, but check it does not set tone the agent should keep.
- **RAG-002** `rag/retrieval.yaml:1` — Retrieval config has no metadata filter (filter, where, namespace…). _Risk:_ Filters wrongly scoped hide relevant documents.
- **RAG-003** `rag/retrieval.yaml:7` — rerank is disabled. _Risk:_ A reranker adds latency and its own cost.
- **CACHE-001** `src/agent.ts:6` — Constant system prompt SYSTEM_PROMPT is sent from 2 call site(s), including inside a loop. _Risk:_ Prompt caching cuts the cost of reprocessing a repeated prefix; it does not shrink the context window. It only helps if the prefix is byte-identical and large enough for the provider to cache.
- **TOOL-002** `tools/tools.json:4` — Same description text appears 2 times: tool get_order, tool list_orders. _Risk:_ Copied descriptions are easy to misapply (check each one still describes its parameter). Required parameters must stay.
- **TOOL-002** `tools/tools.json:4` — Same description text appears 3 times: get_order.order_id (required), list_orders.customer_id (required), cancel_order.order_id (required). _Risk:_ Copied descriptions are easy to misapply (check each one still describes its parameter). Required parameters must stay.

## Applied changes and backups

- `<backup-id>` optimize --apply --quiet: CLAUDE.md

## Remaining risks

- CRITICAL SEC-002 at AGENTS.md:17: Contradiction: line 15 requires "You MUST pin dependency versions in package.json." but line 17 forbids it.
- CRITICAL SEC-001 at prompts/support-system.md:12: Possible anthropic-api-key in a file that is sent to models.
- 9 recommendation(s) are based on static analysis only and need runtime evidence.

## Benchmark

Baseline 2026-10-30T09:12:00.000Z: input tokens 3,453 → 3,337 (-3.4%, estimated). Output tokens: n/a → n/a (no eval run). Findings resolved 5/27. Status: awaiting validation.

## Evaluation

No evaluation run. Quality: not verified.
