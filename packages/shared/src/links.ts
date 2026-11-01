/** Injected by the CLI build (tsup `define`) from the `homepage` field of apps/cli/package.json. */
declare const __TOKENWISE_HOMEPAGE__: string | undefined;

/**
 * Base URL of the TokenWise documentation site, ending in "/", or null when unknown.
 * TOKENWISE_DOCS_URL overrides it (for forks and mirrors); otherwise the published
 * package's homepage is used. No link is printed when neither is set.
 */
export function docsSiteUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const built = typeof __TOKENWISE_HOMEPAGE__ === "string" ? __TOKENWISE_HOMEPAGE__ : "";
  const raw = (env.TOKENWISE_DOCS_URL ?? built).trim();
  if (!/^https?:\/\//.test(raw)) return null;
  return raw.endsWith("/") ? raw : `${raw}/`;
}

/** Link to a rule's entry on the generated rules reference page. */
export function ruleDocsUrl(base: string, ruleId: string): string {
  return `${base}docs/reference/rules/#${ruleId.toLowerCase()}`;
}
