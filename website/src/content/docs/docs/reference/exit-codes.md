---
title: Exit codes
description: What each TokenWise exit code means and when it is used.
---

After this page you can script around TokenWise and tell failures apart.

| Code | Name | When |
|---:|---|---|
| 0 | Success | The command did what was asked. Findings alone do not change this unless you pass `--fail-on`. |
| 1 | Findings above threshold | `tokenwise audit --fail-on <level>` found at least one finding at or above that level. |
| 2 | Usage error | Unknown command or flag, bad flag value, invalid or unknown config key, unknown rule ID, path not found. The message names the problem. |
| 3 | Runtime error | Something failed while running: a file changed on disk during `--apply`, a corrupt backup, a provider error. |
| 4 | Aborted | Consent was missing or refused: `privacy.externalModelCalls` not enabled, no `--allow-external`, no confirmation (or no `--yes` when not in a terminal), or you declined applying AI-proposed changes. Nothing was sent or written. |

`tokenwise hook run` always exits 0, so a hook can never block an agent.
