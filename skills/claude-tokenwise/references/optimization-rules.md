<!-- Generated from skills/_shared/references. Edit the source, then run: pnpm sync-skills -->
# TokenWise rule reference

Each finding has a stable `ruleId`. `autoFixable: true` means `tokenwise optimize` can apply it and the protected-content check (I3) has passed. Everything else needs human judgment.

| Rule | Detects | Auto-fix | When a change is safe |
|---|---|---|---|
| RED-001 | Exact duplicate paragraph in one file | Yes, if both copies share a section or contain no protected statements | The kept copy sits where the instruction applies |
| RED-002 | Exact duplicate section (heading and body) | Yes | Always: the identical section remains |
| RED-003 | Near-duplicate paragraphs (5-shingle Jaccard ≥ threshold) | No | Diff the two first: near-duplicates often differ in one value or negation |
| RED-004 | Same block in several instruction files (e.g. CLAUDE.md and AGENTS.md) | No | Pick one source of truth; reference it from the other file |
| RED-005 | Duplicate code example | Yes, for examples or same-section repeats | The first example stays visible to the reader |
| FMT-001 | Trailing whitespace, repeated blank lines | Yes | Always (code blocks and frontmatter untouched) |
| VERB-001 | Filler and politeness phrases | No | Rewrite the sentence; keep its instruction |
| VERB-002 | Opening/closing paragraph with no instruction | No | Remove only if it sets no tone the agent must keep |
| CTX-001 | Always-loaded root file over `rootInstructionTokens` | No | Move only sections that a minority of tasks need |
| CTX-002 | Large log, data dump or table in an always-loaded file | No | Move to a file; leave a one-line pointer |
| CTX-003 | Same background repeated across subagents/skills | No | Confirm each subagent still receives what it needs |
| TOOL-001..004 | Oversized or duplicated tool schemas, big tool sets | No | Never drop a `required` or referenced parameter |
| RAG-001..004 | High `top_k`, no filters, no reranking, large overlap | No | Confirm with retrieval evals |
| LOOP-001..003 | Model loops/retries with no cap, resent context | No | Static guess only; confirm with usage logs |
| SEC-001 | Secret-like string in a prompt file | No | Remove and rotate the secret |
| SEC-002 | `MUST X` and `MUST NOT X` in one file | No | Decide which rule wins; low confidence |

## Reading the numbers

- Token counts carry `method`: `exact` (local tokenizer for that model), `provider_api` (provider counting endpoint), or `estimated` (heuristic; no model or no offline tokenizer).
- Savings carry `basis`: `measured` (counted before and after an applied change), `estimated` (counted size of text a fix would remove), `potential` (upper bound if a recommendation is followed).
- `n/a` means no evidence. It is never zero.
