# Acme Orders Service — agent instructions

## Security rules

- You MUST NOT log customer email addresses or payment tokens.
- Never commit files under `secrets/` or any `.env` file.
- Do not call the production endpoint `https://api.acme.example/v2/orders` from tests unless the `ACME_ALLOW_PROD` flag is set and a human has approved the run.

## Shared conventions

The fulfillment team owns `src/fulfillment/`. Changes there require a review from @acme/fulfillment. The payments team owns `src/payments/` and changes there require a review from @acme/payments. Do not merge changes to either directory without the owning team's approval.

## Dependencies

- You MUST pin dependency versions in package.json.
- Keep the dependency tree small; prefer the standard library.
- You MUST NOT pin dependency versions in package.json.

## Task decomposition

Split work into steps that each end with passing tests. Report which step you are on.
