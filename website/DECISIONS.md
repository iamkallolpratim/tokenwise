# Website decisions

Decisions made while building the site where the brief left room, or where the code disagreed with it. Format: context → decision (alternatives). Product decisions are on the website under Project → Decisions.

## W1. The code wins over the brief: package name and commands
The brief shows `npx tokenwise audit .`. The npm name `tokenwise` belongs to an unrelated package, and the CLI is published as `@klawde91/tokenwise`. Every command on the site uses `npx @klawde91/tokenwise …` (read from `apps/cli/package.json`), or `tokenwise …` where the page says the command is installed. The brief's `optimize --dry-run` does not exist: `optimize` is a dry run unless `--apply` is given, and the docs say so.

## W2. Pre-release honesty
The package is not on npm yet, so `npx @klawde91/tokenwise` does not work today. The landing page and the installation page say so and show how to run from source. One flag (`PUBLISHED_ON_NPM` in `src/data/release.ts`) removes those notes after the first release.

## W3. URL: project site by default, everything from config
No GitHub owner or domain has been chosen. The site builds for any of the three options from `SITE_URL` and `BASE_PATH` (`site.config.mjs`); CI reads both from the repository's Pages settings via `actions/configure-pages`, so the maintainer's Pages choice is the only input. Pull requests build under `/tokenwise/` to catch base-path bugs. "View on GitHub" and edit links come from the repository the workflow runs in (`REPO_URL`) and are omitted when unknown, rather than guessed.

## W4. Docs live under /docs/, the landing page at /
Content sits in `src/content/docs/docs/` so every docs URL starts with `/docs/` as the brief's information architecture shows; the landing page is a custom `src/pages/index.astro` using `<StarlightPage>` so header, search and theme toggle are shared. Starlight's page title is suppressed on the landing page only (`src/components/PageTitle.astro`) so the page has one `<h1>`, which keeps the `_top` id the skip link targets.

## W5. Own tabs instead of Starlight's `<Tabs>`
Starlight's `<Tabs>` pulls its Markdown processor (with a native binding) into the prerender bundle, which failed to load there. The landing page uses a small framework-free tabs component following the WAI-ARIA tabs pattern (arrow keys, Home, End); without JavaScript all panels stay visible.

## W6. Relative links in Markdown
Links between docs pages are relative (`../quickstart/`) so they work under any base path without a remark plugin; `trailingSlash: "always"` makes them unambiguous. The 404 page is a custom `src/pages/404.astro` with base-prefixed links, because GitHub Pages serves it at arbitrary depths where relative links break.

## W7. Generated reference pages are not committed
`reference/cli`, `reference/rules`, `reference/config-schema`, `reference/report-format` and `changelog` are generated before every build from Commander, the rule registry and fixtures, the Zod schemas and `CHANGELOG.md`, and are gitignored, so they cannot drift. To make that possible:
- each rule now carries a `method` field (how it detects) next to its `description`, and the config schema carries `.describe()` text for every key; both are the single source for the website;
- five classes in the CLI source dropped TypeScript parameter properties (`erasableSyntaxOnly`), so Node 26 can run the source directly and the generators need no extra tooling.
The root test suite runs the generators and the docs-accuracy check, so a broken generator or a docs mention of a removed flag fails `pnpm gate`, not only the site build.

## W8. Rule examples come from the test fixtures
Each rule's example on the rules page is its positive fixture, and the "Reported as" line is what the audit actually reports for it (secrets redacted). No example text is written by hand.

## W9. Demo output is captured, not written
`scripts/capture-demo.ts` runs the built CLI on a temporary copy of `examples/sample-project` with the test suite's network guard preloaded, converts ANSI colors to HTML, and saves the output; CI regenerates it on every build. Captions name the source. The full HTML report from the same run is published at `/demo/sample-report.html`.

## W10. Rule links from the CLI
`tokenwise audit` prints `docs: <site>/docs/reference/rules/#<rule-id>` per finding (and `docsUrl` in JSON) when it knows the site URL: from `homepage` in `apps/cli/package.json` (baked in at build time) or `TOKENWISE_DOCS_URL`. With neither set it prints no link rather than a guessed one. `homepage` is unset until the site URL is decided.

## W11. Accessibility fixes beyond Starlight's defaults
axe found scrollable regions that keyboard users could not reach: Expressive Code blocks and wide Markdown tables. An Expressive Code plugin (`ec.config.mjs`) and a rehype plugin (`astro.config.mjs`) add `tabindex="0"` to them. The copy buttons announce "Copied to clipboard" through a polite live region and fall back to selecting the text when the clipboard API is unavailable.

## W12. CI accessibility and performance checks use Lighthouse CI
Lighthouse's accessibility category runs axe-core rules; `@lhci/cli` asserts ≥ 0.95 in all four categories on five pages, using the Chrome preinstalled on GitHub's runners, without adding a browser-automation dependency to the repository. A full axe-core 4.11 sweep (WCAG 2.0/2.1/2.2 A and AA plus best practices, both themes, every page) was run by hand during development; see the final report.

## W13. Biome does not lint `.astro` files
Biome reports variables used only in Astro templates as unused. `.astro` files are excluded from Biome. They are not type-checked either (that needs `astro check` and `@astrojs/check`, not added); the build fails on template errors, and the generator and check scripts are type-checked by the root `tsconfig.json`.

## W14. Fonts and privacy
System font stacks only (Starlight's default), no web fonts. The theme preference is stored by Starlight in `localStorage`, which is not a cookie and never leaves the browser. `check-site.ts` fails on any third-party script, stylesheet, font, frame or image, on known analytics hosts and on `document.cookie`.

## W15. Astro telemetry is disabled
Astro's CLI telemetry is opt-out. Every Astro invocation goes through `scripts/astro.ts`, which sets `ASTRO_TELEMETRY_DISABLED=1`, and the workflow sets it too, so building the site sends nothing either.
