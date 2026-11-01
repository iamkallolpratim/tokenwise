---
title: Releasing
description: How a TokenWise release is prepared, published to npm and announced on GitHub.
---

After this page a maintainer can cut a release. Publishing to npm and creating a GitHub release are maintainer actions; nothing here runs on its own.

## Status (2026-11-01)

- **0.1.0 is published** as `@klawde91/tokenwise` (`latest`). npm staged that first publish (a public `0.0.0-stage` placeholder was created) and it went live after it was approved under **Staged Packages** on npmjs.com.

- The package is `@klawde91/tokenwise` (`publishConfig.access: public`); the installed command is still `tokenwise`. The unscoped name `tokenwise` belongs to an unrelated package (v0.3.6, another maintainer), so it is not used.
- The package is published under the maintainer's npm user scope `@klawde91`. The `NPM_TOKEN` secret must belong to that account (or have publish rights on the scope). The first attempt used `@klawde`, which belongs to an unrelated npm user, so it could not be published.
- The repository is https://github.com/iamkallolpratim/tokenwise (default branch `production`) and the site is https://iamkallolpratim.github.io/tokenwise/. `apps/cli/package.json` points `repository`, `homepage` and `bugs` there; npm provenance needs `repository.url` to match the repository the release workflow runs in.
- CI (`.github/workflows/ci.yml`) passes on Ubuntu, macOS and Windows.
- The maintainer's npm account uses a security key for two-factor authentication, which cannot answer the CLI's one-time-password prompt. Publishing therefore goes through a granular access token with "bypass two-factor authentication" (the `NPM_TOKEN` secret), or `npm publish <tarball> --auth-type=web` locally. If npm stages a publish, approve it under Staged Packages on npmjs.com.

## Checklist

1. Confirm the `ci` workflow passes on Ubuntu, macOS and Windows for the commit you will tag.
2. Check that `repository`, `homepage` and `bugs` in `apps/cli/package.json` still match the repository and site.
3. Update `CHANGELOG.md` and the version in `apps/cli/package.json` and `apps/cli/src/version.ts`.
4. Run `pnpm gate` and `cd apps/cli && pnpm publish --dry-run --no-git-checks`; check the file list.
5. Make sure the `NPM_TOKEN` repository secret is a current granular token from the `klawde91` account with read and write access to the package and "bypass two-factor authentication" enabled (granular tokens expire).
6. Tag and push: `git tag vX.Y.Z && git push origin production vX.Y.Z`. The `release` workflow re-runs the gate, checks the tag matches the package version, publishes with provenance, and creates the GitHub release from `CHANGELOG.md`.

Publish with `pnpm publish`, or with `npm publish` on a tarball made by `pnpm pack`, never `npm publish` in `apps/cli` directly: the CLI's `devDependencies` use `workspace:` references, which only pnpm rewrites.
