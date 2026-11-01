# Changelog

## 0.1.0 (2026-11-01)

First release, published as `@klawde91/tokenwise` (command: `tokenwise`).

- CLI: `init`, `config`, `scan`, `tokens`, `audit`, `optimize` (deterministic and opt-in AI mode), `restore`, `benchmark` (baselines, eval suites), `report` (JSON, Markdown, HTML), `install-skill`.
- 25 rules: RED-001..005, FMT-001, VERB-001..002, CTX-001..003, SEC-001..002, TOOL-001..004, RAG-001..004, LOOP-001..003, CACHE-001.
- Protected-content check (I3) on every transformation; backups and byte-for-byte restore.
- Tokenizers: exact OpenAI counts (o200k_base, o200k_harmony, cl100k_base via gpt-tokenizer), Anthropic `count_tokens` API behind consent, calibrated generic estimator.
- Claude Code and Codex skills with shared references.
- `ingest`: imports Claude Code transcripts and recorded Anthropic/OpenAI usage (counts only) so the agent-loop score has runtime evidence; usage summary in reports.
- `hook install` / `hook run`: optional, read-only PostToolUse hook for Claude Code and Codex.
- Website (`website/`, Astro + Starlight, deployed to GitHub Pages): landing page with output captured from real runs, and all documentation. CLI, rules, config and report reference pages are generated from code.
- `tokenwise audit` links each finding to its rule documentation once the package `homepage` (or `TOKENWISE_DOCS_URL`) is set.
