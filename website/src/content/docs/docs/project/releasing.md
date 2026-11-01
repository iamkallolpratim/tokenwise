---
title: Releasing
description: How a TokenWise release is prepared, published to npm and announced on GitHub.
---

After this page a maintainer can cut a release. Nothing here runs automatically.

Nothing here runs automatically. Publishing to npm and creating a GitHub release are maintainer actions.

## Status (2026-10-31)

- The package is `@klawde/tokenwise` (`publishConfig.access: public`); the installed command is still `tokenwise`. The unscoped name `tokenwise` belongs to an unrelated package (v0.3.6, another maintainer), so it is not used.
- Publishing needs an npm account that owns the `@klawde` scope (the npm user `klawde`, or an npm organization named `klawde`). Only checked so far: `@klawde/tokenwise` returned 404 (unpublished) on 2026-10-31.
- The repository is https://github.com/iamkallolpratim/tokenwise (default branch `production`) and the site is https://iamkallolpratim.github.io/tokenwise/. `apps/cli/package.json` points `repository`, `homepage` and `bugs` there; npm provenance needs `repository.url` to match the repository the release workflow runs in.
- CI (`.github/workflows/ci.yml`) has never run: there is no remote. The gate has passed on macOS arm64 and on Linux arm64 (`pnpm gate:linux`, Docker). Windows is untested.

## Checklist

1. Push the repository to GitHub and confirm the `ci` workflow passes on Ubuntu, macOS and Windows.
2. Check that `repository`, `homepage` and `bugs` in `apps/cli/package.json` still match the repository and site.
3. Update `CHANGELOG.md` and the version in `apps/cli/package.json` and `apps/cli/src/version.ts`.
4. Run `pnpm gate` and `cd apps/cli && pnpm publish --dry-run --no-git-checks`; check the file list.
5. Add an npm automation token with publish rights on `@klawde` as the `NPM_TOKEN` repository secret.
6. Tag and push: `git tag v0.1.0 && git push origin production v0.1.0`. The `release` workflow re-runs the gate, checks the tag matches the package version, publishes with provenance, and creates the GitHub release from `CHANGELOG.md`.

Publish with `pnpm`, not `npm`: the CLI's `devDependencies` use `workspace:*`, which `pnpm publish` rewrites.
