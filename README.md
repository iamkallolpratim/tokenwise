# TokenWise

**Reduce token waste. Preserve intelligence.**

TokenWise is a local-first CLI that finds unnecessary LLM token usage in the files AI agents read (`CLAUDE.md`, `AGENTS.md`, skills, subagents, prompt templates, tool schemas, agent and retrieval configuration), explains the risk of each change, and applies only the fixes it can prove are safe: with a diff first, a backup, and `tokenwise restore`. It makes no network requests and sends no telemetry unless you explicitly allow a feature that needs a model provider.

## Install

Requires Node.js 26 or newer. No API key, no account.

```bash
npx @klawde91/tokenwise --help
```

`@klawde91/tokenwise` is not published to npm yet. Until the first release, run it from source:

```bash
pnpm install && pnpm build
node apps/cli/dist/index.js --help
```

## Quickstart

```bash
npx @klawde91/tokenwise init                  # writes tokenwise.config.json, lists the agent files it found
npx @klawde91/tokenwise audit --model gpt-5   # findings with risk and estimated savings
npx @klawde91/tokenwise optimize              # dry run: shows the diff, writes nothing
npx @klawde91/tokenwise optimize --apply      # applies it, backing up to .tokenwise/backups/
npx @klawde91/tokenwise restore --list        # undo any change
```

## Documentation

All documentation is on the TokenWise website: **https://iamkallolpratim.github.io/tokenwise/**. Start with the [introduction](https://iamkallolpratim.github.io/tokenwise/docs/) or the [quickstart](https://iamkallolpratim.github.io/tokenwise/docs/getting-started/quickstart/). The site is built from [`website/`](https://github.com/iamkallolpratim/tokenwise/tree/production/website). To work on the code, see [CONTRIBUTING.md](https://github.com/iamkallolpratim/tokenwise/blob/production/CONTRIBUTING.md).

## License

[MIT](https://github.com/iamkallolpratim/tokenwise/blob/production/LICENSE)
