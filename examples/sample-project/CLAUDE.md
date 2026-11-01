# Acme Orders Service

Hello Claude! Thank you so much for helping out with this project. We really appreciate your assistance and we hope you enjoy working on this codebase as much as we do. This document describes how we like to work.

## Project overview

Acme Orders is a TypeScript service that accepts orders from the storefront, validates them, and publishes them to the fulfillment queue. The public API is served from `src/server.ts` and documented at https://docs.acme.example/orders/v2.

## Coding standards

- Use TypeScript strict mode for all new files.
- Prefer small pure functions over classes.
- Please make sure to always run `pnpm test` before you say a task is done.
- Keep functions under 50 lines where practical.



## Security rules

- You MUST NOT log customer email addresses or payment tokens.
- Never commit files under `secrets/` or any `.env` file.
- Do not call the production endpoint `https://api.acme.example/v2/orders` from tests unless the `ACME_ALLOW_PROD` flag is set and a human has approved the run.

## Testing

Run the unit tests with `pnpm test` and the integration tests with `pnpm test:integration`. Integration tests need a local Postgres started with `docker compose up db`.   
Always add a regression test when you fix a bug.  

## Error handling

Wrap every external call in `withRetry()` from `src/lib/retry.ts`. Retries use exponential backoff with a maximum of 5 attempts. Never swallow errors silently; log them with `logger.error` and rethrow.

## Example: creating an order

```ts
const order = await createOrder({ sku: "ABC-123", quantity: 2 });
await publish("orders.created", order);
```

## Commit messages

Use Conventional Commits, for example `fix(api): reject negative quantities`. Keep the subject under 72 characters.

Reference the issue number in the commit body so the change can be traced back to its ticket.

Reference the issue number in the commit body so the change can be traced back to its ticket.

## Error handling

Wrap every external call in `withRetry()` from `src/lib/retry.ts`. Retries use exponential backoff with a maximum of 5 attempts. Never swallow errors silently; log them with `logger.error` and rethrow.

## Database

All schema changes go through migrations in `db/migrations/`. Run migrations locally with `pnpm db:migrate` before you start the service, and always review the generated SQL before committing it to the repository.

All schema changes go through migrations in `db/migrations/`. Run migrations locally with `pnpm db:migrate` before you start the service, and always review the generated SQL before committing it to the main repository.

## Example: creating an order (again)

```ts
const order = await createOrder({ sku: "ABC-123", quantity: 2 });
await publish("orders.created", order);
```

## Shared conventions

The fulfillment team owns `src/fulfillment/`. Changes there require a review from @acme/fulfillment. The payments team owns `src/payments/` and changes there require a review from @acme/payments. Do not merge changes to either directory without the owning team's approval.

## Recent production incident log

```text
2026-09-14T08:01:12Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=1 orderId=ord_8812
2026-09-14T08:01:42Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=2 orderId=ord_8812
2026-09-14T08:02:12Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=3 orderId=ord_8812
2026-09-14T08:02:42Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=4 orderId=ord_8812
2026-09-14T08:03:12Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=5 orderId=ord_8812
2026-09-14T08:03:13Z WARN  orders.publish giving up orderId=ord_8812 moving to dead-letter queue=fulfillment-dlq
2026-09-14T08:04:01Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=1 orderId=ord_8813
2026-09-14T08:04:31Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=2 orderId=ord_8813
2026-09-14T08:05:01Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=3 orderId=ord_8813
2026-09-14T08:05:31Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=4 orderId=ord_8813
2026-09-14T08:06:01Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=5 orderId=ord_8813
2026-09-14T08:06:02Z WARN  orders.publish giving up orderId=ord_8813 moving to dead-letter queue=fulfillment-dlq
2026-09-14T08:07:44Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=1 orderId=ord_8814
2026-09-14T08:08:14Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=2 orderId=ord_8814
2026-09-14T08:08:44Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=3 orderId=ord_8814
2026-09-14T08:09:14Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=4 orderId=ord_8814
2026-09-14T08:09:44Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=5 orderId=ord_8814
2026-09-14T08:09:45Z WARN  orders.publish giving up orderId=ord_8814 moving to dead-letter queue=fulfillment-dlq
2026-09-14T08:11:20Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=1 orderId=ord_8815
2026-09-14T08:11:50Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=2 orderId=ord_8815
2026-09-14T08:12:20Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=3 orderId=ord_8815
2026-09-14T08:12:50Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=4 orderId=ord_8815
2026-09-14T08:13:20Z ERROR orders.publish timeout after 30000ms queue=fulfillment-primary attempt=5 orderId=ord_8815
2026-09-14T08:13:21Z WARN  orders.publish giving up orderId=ord_8815 moving to dead-letter queue=fulfillment-dlq
2026-09-14T08:15:02Z INFO  queue=fulfillment-primary recovered after broker failover node=mq-2
2026-09-14T08:15:03Z INFO  dlq replay started count=4 operator=oncall
2026-09-14T08:15:40Z INFO  dlq replay finished replayed=4 failed=0
```

## Release process

1. Bump the version in `package.json`.
2. Update `CHANGELOG.md`.
3. Open a pull request titled `release: vX.Y.Z`.
4. A maintainer tags the release after CI is green.

## API reference summary

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/v2/orders` | POST | bearer | Create an order |
| `/v2/orders/{id}` | GET | bearer | Fetch an order |
| `/v2/orders/{id}` | PATCH | bearer | Update an order |
| `/v2/orders/{id}/cancel` | POST | bearer | Cancel an order |
| `/v2/orders/{id}/items` | GET | bearer | List order items |
| `/v2/orders/{id}/items` | POST | bearer | Add an item |
| `/v2/orders/{id}/items/{itemId}` | DELETE | bearer | Remove an item |
| `/v2/orders/{id}/refunds` | POST | bearer | Request a refund |
| `/v2/orders/{id}/refunds` | GET | bearer | List refunds |
| `/v2/orders/{id}/events` | GET | bearer | Order event history |
| `/v2/orders/search` | POST | bearer | Search orders |
| `/v2/orders/export` | POST | admin | Export orders as CSV |
| `/v2/customers/{id}/orders` | GET | bearer | Orders for a customer |
| `/v2/health` | GET | none | Health check |
| `/v2/metrics` | GET | internal | Prometheus metrics |
| `/v2/webhooks` | POST | signature | Inbound webhooks |
| `/v2/webhooks/{id}/retry` | POST | admin | Retry a webhook delivery |
| `/v2/admin/reindex` | POST | admin | Rebuild the search index |

Thanks again for all your help! Let us know if you have any questions, and have a wonderful day. We look forward to working with you.
