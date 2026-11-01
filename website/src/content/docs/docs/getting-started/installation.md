---
title: Installation
description: Install TokenWise with npx, as a global command, or from source.
---

After reading this page you will have a working `tokenwise` command.

TokenWise needs **Node.js 26 or newer**. It needs no API key and no account.

## With npx

Runs the latest version without installing anything:

```bash
npx @klawde91/tokenwise --help
npx @klawde91/tokenwise audit .
```

## As a global command

```bash
npm install -g @klawde91/tokenwise
tokenwise --version
```

## As a project dependency

Needed if you use the [optional hook](../../agent-skills/hooks/), which runs `npx --no-install` and so only finds a local install:

```bash
npm install -D @klawde91/tokenwise
```

## From source

For contributors, or to try unreleased changes. Requires pnpm 9.

```bash
git clone https://github.com/iamkallolpratim/tokenwise.git
cd tokenwise
pnpm install
pnpm build
node apps/cli/dist/index.js --help
```

To get a `tokenwise` command from your checkout, pack it and install the tarball globally:

```bash
cd apps/cli
pnpm pack
npm install -g ./klawde91-tokenwise-0.1.0.tgz
tokenwise --version
```

## Check your Node.js version

```bash
node --version
```

If it prints a version below `v26`, install a current release from [nodejs.org](https://nodejs.org/).

## Next

Follow the [quickstart](../quickstart/).
