// The only place the site's URL is decided. Every link, asset path, canonical URL and the
// sitemap derive from SITE_URL + BASE_PATH, so moving between a project site
// (https://<owner>.github.io/tokenwise/), a user/org site or a custom domain is config only.
//
// CI sets these from actions/configure-pages; locally they default to a root-path dev server.
const env = (name) => {
  const v = process.env[name];
  return v?.trim() ? v.trim() : undefined;
};

function normalizeBase(b) {
  const trimmed = `/${b}/`.replace(/\/{2,}/g, "/");
  return trimmed;
}

/** Origin only, e.g. https://owner.github.io or https://tokenwise.dev */
export const SITE_URL = (env("SITE_URL") ?? "http://localhost:4321").replace(/\/+$/, "");
/** Always starts and ends with "/": "/" or "/tokenwise/". */
export const BASE_PATH = normalizeBase(env("BASE_PATH") ?? "/");
/** GitHub repository URL for "View on GitHub" and edit links; links are omitted when unset. */
export const REPO_URL = env("REPO_URL")?.replace(/\/+$/, "") ?? null;
/** Branch used for "Edit page" links. */
export const REPO_BRANCH = env("REPO_BRANCH") ?? "main";
