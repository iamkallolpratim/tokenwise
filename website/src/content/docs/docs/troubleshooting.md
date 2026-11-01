---
title: Troubleshooting
description: Common messages and exit codes, what causes them, and how to fix them.
---

After this page you can resolve the most common TokenWise errors and surprises.

| Symptom | Cause and fix |
|---|---|
| `warning: No model selected; using generic estimator` | Counts are `estimated`. Pass `--model gpt-5` (exact) or set `defaultModel`. |
| Claude counts are `estimated` | No offline Claude tokenizer exists. Enable `privacy.externalModelCalls`, export `ANTHROPIC_API_KEY`, run `tokenwise tokens --model claude-… --allow-external`. |
| A file is missing from `scan` | Run `tokenwise scan --verbose`. Check `.gitignore`, `exclude`, `maxFileSizeBytes`, and whether the file has prompt signals (see D7 in [Decisions](../project/decisions/)). Name it directly (`tokenwise audit path/to/file.md`) to analyze it anyway. |
| `rejected <file>: N protected span(s) would be removed or altered` | A fix would have dropped or changed a protected statement, so nothing was written. Edit that part by hand. |
| `<file> changed on disk since it was read` | Another process edited the file during `optimize --apply`. Re-run. |
| `restore` refuses: modified after this backup | You edited the file after optimizing. `--force` overwrites those edits (the current state is backed up first). |
| Exit code 4 | Consent missing: config, `--allow-external`, or `--yes` in a non-interactive shell. |
| Exit code 2 | Bad flag or config. The message names the field. |
| Exit code 1 | `--fail-on` threshold reached (intended for CI). |
| `Quality: not verified` | Expected without an eval suite. Add `.tokenwise/evals/*.yaml` and run `benchmark --save-baseline --eval` before optimizing. |
| Agent shows "hook error … non-blocking status code" | The hook command could not start `tokenwise` (`npx --no-install` finds no local install). Add `@klawde91/tokenwise` to the project's devDependencies, or reinstall the hook with `--command "<launcher> tokenwise hook run --target claude"`. The hook itself always exits 0. |
| Hook never reports anything | It only reports HIGH/CRITICAL findings in instruction files the agent just wrote. Test it: `echo '{"hook_event_name":"PostToolUse","cwd":"'$PWD'","tool_input":{"file_path":"CLAUDE.md"}}' \| npx @klawde91/tokenwise hook run --target claude --verbose`. Codex loads project hooks only for trusted projects. |
| Agent-loop score stays `n/a` after `ingest` | It needs at least 3 follow-up requests (requests after the first in a session). Logs without a session id count toward totals but not follow-ups. |
