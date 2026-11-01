# Architecture notes

The service has three layers: HTTP handlers, domain logic, and adapters. Orders move from
`pending` to `paid` to `shipped`. See `src/server.ts` for the entry point.
