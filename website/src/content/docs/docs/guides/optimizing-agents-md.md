---
title: Optimizing AGENTS.md
description: Reduce token use in AGENTS.md files read by Codex and other agents, including nested and override files.
---

After this guide you can audit every `AGENTS.md` in a repository and decide what to consolidate.

## How AGENTS.md is loaded

Codex reads, per directory from the repository root down to the working directory, `AGENTS.override.md` or else `AGENTS.md`, and concatenates them up to a size cap (`project_doc_max_bytes`). Nested files therefore add to, rather than replace, the root file. Text repeated between levels is paid for twice.

## Audit all of them

```bash
tokenwise audit --model gpt-5
```

Relevant rules:

- [RED-004](../../reference/rules/#red-004): blocks repeated across instruction files (`AGENTS.md`, nested copies, `CLAUDE.md`). One finding per set of files.
- [CTX-001](../../reference/rules/#ctx-001): a root `AGENTS.md` over the token threshold.
- [RED-001](../../reference/rules/#red-001) / [RED-002](../../reference/rules/#red-002) / [RED-003](../../reference/rules/#red-003): duplication inside one file.
- [SEC-002](../../reference/rules/#sec-002): contradictory MUST / MUST NOT pairs in one file.

## Consolidate

- Keep repository-wide rules in the root file only; let nested files hold what is specific to their directory.
- Move task-specific procedures into a skill under `.agents/skills/`, which Codex loads only when it selects the skill.
- If your repository also has a `CLAUDE.md` with the same content, keep one source. Claude Code reads only `CLAUDE.md` when both exist, so the duplicate costs you in Codex, not twice in one session.

Exact duplicates within one file can be removed with `tokenwise optimize --apply`; cross-file duplication is always a recommendation, because which copy to keep is your call.

## Let Codex do it

The [Codex skill](../../agent-skills/codex/) runs the audit and proposes diffs for your approval.
