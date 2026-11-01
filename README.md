# TokenWise

**Reduce token waste. Preserve intelligence.**

TokenWise is a local-first CLI that finds unnecessary LLM token usage in the files AI agents read (`CLAUDE.md`, `AGENTS.md`, skills, subagents, prompt templates, tool schemas, agent and retrieval configuration), explains the risk of each change, and applies only the fixes it can prove are safe: with a diff first, a backup, and `tokenwise restore`. It makes no network requests and sends no telemetry unless you explicitly allow a feature that needs a model provider.

## Install

Requires Node.js 26 or newer. No API key, no account.

```bash
npx @klawde/tokenwise --help
```

`@klawde/tokenwise` is not published to npm yet. Until the first release, run it from source:

```bash
pnpm install && pnpm build
node apps/cli/dist/index.js --help
```

## Quickstart

```bash
npx @klawde/tokenwise init                  # writes tokenwise.config.json, lists the agent files it found
npx @klawde/tokenwise audit --model gpt-5   # findings with risk and estimated savings
npx @klawde/tokenwise optimize              # dry run: shows the diff, writes nothing
npx @klawde/tokenwise optimize --apply      # applies it, backing up to .tokenwise/backups/
npx @klawde/tokenwise restore --list        # undo any change
```

## Documentation

All documentation is on the TokenWise website, built from [`website/`](website/) and published to GitHub Pages. Start with the [introduction](website/src/content/docs/docs/index.md) or the [quickstart](website/src/content/docs/docs/getting-started/quickstart.md). To work on the code, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
