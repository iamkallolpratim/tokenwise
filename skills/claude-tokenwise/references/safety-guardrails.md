<!-- Generated from skills/_shared/references. Edit the source, then run: pnpm sync-skills -->
# Safety guardrails

These hold for every edit, whether TokenWise applies it or you write it.

## Protected content (keep verbatim)

- Negations and exceptions: never, do not, unless, except, only if.
- Normative keywords: MUST, MUST NOT, SHOULD, required, forbidden.
- Security, privacy, data-handling, permission and human-approval statements.
- Fenced code blocks and inline code.
- URLs, file paths, API endpoints, identifiers, JSON/YAML keys, type definitions.
- Citations and evidence references.
- Output-format and schema requirements.

Removing an exact duplicate is allowed only when an identical copy remains in the same scope.

## Workflow rules

- Show a diff before any change. Apply only after the user explicitly approves.
- `tokenwise optimize` is a dry run unless `--apply` is passed; applied changes are backed up under `.tokenwise/backups/` and undone with `tokenwise restore <id>`.
- Do not read `.env*`, key or credential files. Do not echo secrets; TokenWise redacts them in its output.
- Do not send file content to external services unless the user asks. TokenWise requires `privacy.externalModelCalls: true`, `--allow-external`, and a confirmation for any such call.
- Report numbers with their labels (`exact`/`estimated`, `measured`/`potential`). Without an evaluation, say "Quality: not verified".
