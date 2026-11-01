---
title: Hooks
description: Add an optional, read-only hook that reports new findings to Claude Code or Codex after it edits an instruction file.
---

After this page you can install, test and remove the TokenWise hook.

The hook is opt-in. After the agent writes a file, it audits that file if it is an instruction file and, if there are HIGH or CRITICAL findings, tells the agent in at most 800 characters. It never edits files, gives up silently after 5 seconds (the harness timeout is 10), and always exits 0, so it cannot block the agent.

There is no session-start hook on purpose: adding a summary to every session would itself cost tokens.

## Install

The hook runs `npx --no-install @klawde/tokenwise hook run`, so install TokenWise in the project first (`npm install -D @klawde/tokenwise`), or pass `--command` with another launcher.

```bash
tokenwise hook install --target claude --scope project           # shows the settings diff
tokenwise hook install --target claude --scope project --apply   # writes it, with a backup
tokenwise hook install --target codex --scope project --apply
```

| Target | Scope | File | Matcher |
|---|---|---|---|
| `claude` | `project` | `.claude/settings.json` | `Edit\|Write` |
| `claude` | `local` | `.claude/settings.local.json` | `Edit\|Write` |
| `claude` | `user` | `~/.claude/settings.json` | `Edit\|Write` |
| `codex` | `project` | `.codex/hooks.json` | `apply_patch` |
| `codex` | `user` | `~/.codex/hooks.json` | `apply_patch` |

Other settings in the file are kept as they are. Running install twice changes nothing. Codex loads project hooks only when the project's `.codex/` layer is trusted.

## Test it

```bash
echo '{"hook_event_name":"PostToolUse","cwd":"'"$PWD"'","tool_input":{"file_path":"CLAUDE.md"}}' \
  | tokenwise hook run --target claude --verbose
```

It prints hook JSON (`hookSpecificOutput.additionalContext`) when there is something to report, and nothing otherwise. `--min-severity` changes the threshold; `--timeout-ms` the time limit.

## Remove

```bash
tokenwise hook install --target claude --scope project --remove --apply
```

or restore the backup printed at install time with `tokenwise restore <id>` (for user scope, add `--cwd ~`, as the install output shows).
