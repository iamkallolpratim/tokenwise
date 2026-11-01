#!/usr/bin/env bash
# Runs the full gate in a clean Linux container (node:26-bookworm-slim) from a read-only copy of
# the working tree. Needs Docker. Usage: pnpm gate:linux
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm -i -v "$root":/src:ro node:26-bookworm-slim bash -s <<'IN'
set -euo pipefail
mkdir -p /work
cd /src && tar --exclude=node_modules --exclude=dist --exclude=.tokenwise --exclude=.lighthouseci --exclude=.astro -cf - . | (cd /work && tar -xf -)
cd /work
# Node 25+ no longer bundles corepack.
npm install -g --silent pnpm@9.15.0
node --version && pnpm --version
pnpm install --frozen-lockfile
pnpm gate
node apps/cli/dist/index.js scan examples/sample-project
IN
