# Contributing

```bash
pnpm install
pnpm gate                       # typecheck, lint, build, all tests
pnpm gate:linux                 # the same gate in a clean Linux container (needs Docker)
pnpm sync-skills                # after editing skills/_shared/references
pnpm --filter website dev       # the documentation site, with live reload
pnpm --filter website build     # reference generators, demo capture, static build
pnpm --filter website check     # docs accuracy, links, privacy and size checks on the build
```

Requires Node.js 26+ and pnpm 9.

How to add a rule, a tokenizer adapter or a model provider, how the tests are organized, and how the documentation is generated are described in the [contributing guide](website/src/content/docs/docs/project/contributing.md) on the website. The project's design decisions are in [Decisions](website/src/content/docs/docs/project/decisions.md).
