---
title: Decisions
description: Records of design decisions made where requirements were ambiguous, with the alternatives considered.
---

After this page you will know why TokenWise behaves the way it does in the edge cases its requirements left open. Website-specific decisions are in `website/DECISIONS.md`.

Short records of choices made where the brief was ambiguous. Format: context → decision (alternatives).

## D1. Node.js engine range

Context: brief requires "current Active LTS or newer". nodejs.org (2026-10-30) lists v26 as Latest LTS; v24/v22 remain LTS.
Decision: `engines.node >=26.0.0`; CI runs Node 26. Code avoids APIs newer than Node 22 so a later relaxation is cheap.
Alternatives: `>=24` (wider reach, but not "Active LTS").

## D2. TypeScript 6.0.x, not 7.x

Context: `typescript@latest` is 7.0.2 (new major). Build tooling (tsup) and editor support are proven on 6.x.
Decision: pin `typescript@6.0.3` for typechecking; tsup/esbuild does the emit.
Alternatives: TS 7 — revisit once tooling catches up.

## D3. Tokenizer library: gpt-tokenizer

Context: needs a maintained pure-JS tiktoken port. `gpt-tokenizer` (no deps, updated 2026-10-18) vs `js-tiktoken` (last modified 2025-08).
Decision: `gpt-tokenizer@4.1.0`. TokenWise keeps its own model→encoding table copied from tiktoken's `model.py`, so a model only gets `exact` counts when tiktoken itself maps it.
Alternatives: relying on gpt-tokenizer's default encoding for unknown models — rejected: that is a guess, which would mislabel counts as exact.

## D4. Environment variables cannot enable egress

Context: config precedence puts env above project config; I1 requires config + flag + confirmation.
Decision: only `TOKENWISE_MODEL` and `TOKENWISE_MAX_FILE_SIZE` are read from the environment. `privacy.*` can be set only in a config file. `privacy.telemetry` must be `false` (schema literal).

## D5. "Explicitly included" secret files

Context: I5 says secret files are skipped "unless the user explicitly includes them".
Decision: a secret-pattern file is read only when it is the scan target itself (`tokenwise scan .env.prompt`) or listed as a literal (non-glob) path in `include`. Glob matches never count.

## D6. Repo root for relative paths

Decision: paths are relative to `--cwd` (default: process cwd) when the target is inside it; otherwise relative to the target directory. `.gitignore` files are read from that root downward.

## D7. Weak name signals need content evidence

Context: brief lists `*prompt*`, `*system*`, `*agent*` as path signals but also says a generic README is not a prompt.
Decision: strong signals (`CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `.claude/**`, `.agents/**`, `prompts/**`) classify alone. Name-only signals require ≥2 model-addressed lines. Unsignalled Markdown needs a "You are a…" role statement plus ≥4 model-addressed lines. READMEs, changelogs, lockfiles, package.json and tsconfig are never prompts.

## D8. Generic estimator weights

Context: the estimator must be calibrated against the exact OpenAI tokenizer.
Decision: weights fitted by grid search against `o200k_base` on `tests/fixtures/corpus` (6 files). Because the corpus is small, the fitted error (≤5.2%) is optimistic; held-out error on the sample project is reported separately in [Token counting](../../concepts/token-counting/).

## D9. Scope for removing duplicated protected statements (RED-001, RED-005)

Context: I3 allows deleting an exact duplicate of a protected span "if at least one instance remains in the same scope".
Decision: scope = the Markdown section (text under one heading). RED-001 auto-fixes only when both copies share a section or the paragraph holds no protected statements. RED-005 auto-fixes code repeats in the same section or between sections whose headings both say "example"; if the repeat was the section's only content, the empty section goes too. RED-002 duplicates the heading as well, so it is always in scope.

## D10. RED-004 severity and wording

Context: Claude Code reads only CLAUDE.md when both CLAUDE.md and AGENTS.md exist (verified), so the duplicate is not always loaded twice.
Decision: MEDIUM, savings `potential`; recommend `@AGENTS.md` import and say imports do not cut context cost.

## D11. SEC-002 compares statements within one file only

Decision: contradictions are matched only inside a file and only when the normalized objects are identical. Cross-file pairs are not loaded together by every harness, so they are skipped (precision over recall).

## D12. CTX-003 covers subagents and prompt templates, not skills

Context: skills load on demand one at a time; repeated text between two skills is not paid twice in one context. Dogfooding showed the TokenWise Claude and Codex skills (which target different tools) flagged as duplicates.
Decision: CTX-003 compares only `subagent` and `prompt-template` files.

## D13. Explicit file targets are always analyzed

Decision: `tokenwise audit path/to/file.md` analyzes the file as `other-relevant` even without prompt signals, so users (and the dogfood check) can audit any doc deliberately.

## D14. Skill install name

Decision: both skills install as a directory named `tokenwise` (the Claude Code command becomes `/tokenwise`). Sources live in `skills/claude-tokenwise` and `skills/codex-tokenwise`; `skills/_shared` is never installed.

## D15. Phase 4 thresholds and static-analysis scope
Decision: `toolSchemaTokens` defaults to 300 per tool definition, `toolCount` to 20, `ragTopK` to 10; RAG-004 fires at overlap ≥ 25% of chunk size. LOOP rules parse JS/TS (brace matching) and Python (indentation) loop bodies with regexes, not a full parser; they look only at `while (true)`, `for (;;)`, `do {}`, `while True:` and at loops whose model-call arguments are never reassigned. All LOOP/RAG/CACHE findings are `kind: "recommendation"` with low confidence and a `confirmWith` note. Source files are analyzed only if they contain a model-call signal (`MODEL_CALL` in discovery.ts).

## D16. Caching and routing recommendations
Decision: CACHE-001 flags a constant system prompt sent from several call sites or a loop, and its text separates provider prompt caching (cheaper reprocessing, same context size), semantic response caching (a quality risk) and application result caching. No model-routing rule exists: TokenWise never claims a model is cheaper or better. Routing evidence comes only from the user's `pricing` config plus eval results in `tokenwise benchmark`.

## D17. Stable finding IDs use an idKey when evidence is volatile
Context: brief says id = hash(ruleId + file + normalized evidence). Evidence for some rules contains token counts or depends on line positions, so IDs changed after unrelated edits and benchmark reported spurious "introduced" findings.
Decision: id = hash(ruleId + file + (idKey ?? normalized evidence)). Rules whose evidence is volatile (CTX-001, CTX-002, VERB-*, RED-003, SEC-001, LOOP-*) supply a content-based idKey.

## D18. AI-assisted mode sends whole files and keeps them only if I3 passes
Decision: `optimize --mode ai` sends each prose file with its extracted protected spans as a must-keep list, treats the reply as a full-file proposal, rejects it if any protected span is missing or altered or if it is not smaller, and labels accepted proposals "AI-proposed, not guaranteed equivalent". Files whose redacted form differs from the original (they contain secrets) are not sent. Applying needs a TTY confirmation or `--apply --yes`.

## D19. RED-004 reports one finding per set of files
Context: performance testing on 5,000 files showed n²/2 pairwise findings when many nested AGENTS.md files share a block.
Decision: findings are grouped by the exact set of files that share blocks.

## D20. Usage-log ingest scores only the agent-loop dimension
Context: Section 10 makes `tokenwise ingest` optional; Section 11 says output efficiency "requires eval or usage data".
Decision: `ingest` imports Claude Code transcripts and recorded Anthropic/OpenAI responses into `.tokenwise/usage.json` (numbers, model ids, timestamps, hashed session and request ids — never content; file mode 0600; added to `.gitignore` by `init`). The agent-loop dimension scores the share of input read from cache on follow-up requests (`100 × share / 0.8`, at least 3 follow-ups), because re-sending uncached context every turn is the loop waste usage logs can prove. Output efficiency stays eval-only: output length alone cannot tell needed output from waste. Static LOOP findings still never score.

## D21. Hooks are PostToolUse only, report-only, and installed explicitly
Context: Section 13 allows optional hooks that are opt-in, read-only, time-bounded and non-blocking.
Decision: `tokenwise hook install` (dry run unless `--apply`, with backup and `restore`) adds one PostToolUse entry (`Edit|Write` for Claude Code, `apply_patch` for Codex) that runs `npx --no-install @klawde91/tokenwise hook run`. The hook audits only instruction files the tool just wrote, reports HIGH+ findings in at most 800 characters of `additionalContext`, never writes files (not even the audit cache), gives up silently after 5 s (harness timeout 10 s), and exits 0 on every error. No SessionStart hook: injecting a summary into every session would itself cost tokens. Entries are found and removed by the `tokenwise hook run` marker, so a custom `--command` must contain it.

## D22. Backups can record files TokenWise created
Context: installing a hook may create `.claude/settings.json` or `.codex/hooks.json`.
Decision: backup manifests mark such files `created: true`; `restore` removes them (and its safety backup marks them `deleted: true`, so restoring that recreates them). User-scope hook installs keep their backup under the home directory and print `tokenwise restore <id> --cwd <home>`.
