<!-- Generated from skills/_shared/references. Edit the source, then run: pnpm sync-skills -->
# Agent architecture

## Context loading

- Always-loaded files (root `CLAUDE.md`, `AGENTS.md`) cost tokens on every task. Keep only what most tasks need.
- On-demand options: Claude Code path-scoped rules (`.claude/rules/*.md` with a `paths` field) and skills; Codex skills (`.agents/skills/`) and nested `AGENTS.md` files closer to the code they describe.
- Imports (`@path` in CLAUDE.md) organize text but load it with the importing file, so they do not reduce context.

## Subagents and delegation

- Give each subagent only role-specific context. Check what it inherits before deleting shared background.
- Delegate self-contained subtasks with a short brief instead of the whole conversation.

## Tools

- Tool schemas are sent with every request that offers the tool. Keep descriptions to what the model needs to choose and call it.
- Move long examples out of descriptions. Share common parameter text through one clear definition.
- Large tool sets: load groups of tools on demand when the harness supports it.
- Never remove a parameter that is `required` or referenced elsewhere.

## Retrieval (RAG)

- High `top_k` and large chunk overlap send near-duplicate chunks. Measure answer quality before and after lowering them.
- Metadata filters and a reranking step usually cut retrieved tokens more safely than smaller chunks.

## Caching (three different things)

- **Prompt caching** (provider feature): repeated prefix processed cheaper and faster. Context size is unchanged.
- **Semantic response caching**: reuse an answer for a similar question. Saves whole calls; risks stale or wrong reuse.
- **Application result caching**: cache tool or retrieval results you would otherwise recompute.

## Model routing

Route by your own evidence: configured prices (`pricing` in tokenwise.config.json), availability, and evaluation results. TokenWise does not assume any model is cheaper or better.

## Loops

Every model loop needs an iteration cap, every retry a maximum, and repeated calls should not resend unchanged context. Static analysis can only point at candidates; usage logs confirm them.
