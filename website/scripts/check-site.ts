// Checks the built site (dist/). Exits non-zero on any failure. Docs accuracy (commands, flags,
// config keys) is checked separately by check-docs.ts, which needs no build.
//   links     every internal href/src (and #anchor) resolves to a built file under BASE_PATH
//   sitemap   every sitemap URL and the robots.txt sitemap use SITE_URL + BASE_PATH and exist
//   pages     one <h1>, a <title>, a meta description and a canonical URL per page
//   privacy   no third-party scripts, styles, fonts, frames or images; no analytics or cookies
//   budget    JavaScript loaded by the landing page stays under 100 KB
// Pass --external to also check external links (network; failures from flaky hosts only warn).
import { existsSync, promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { BASE_PATH, SITE_URL } from "../site.config.mjs";
import { WEBSITE } from "./lib/paths.ts";

const DIST = path.join(WEBSITE, "dist");
const JS_BUDGET = 100 * 1024;
const errors: string[] = [];
const warnings: string[] = [];
const fail = (check: string, msg: string) => errors.push(`[${check}] ${msg}`);

if (!existsSync(DIST)) {
  console.error("check-site: dist/ not found; run the build first.");
  process.exit(1);
}

async function files(dir: string, ext: RegExp): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p, ext)));
    else if (ext.test(e.name)) out.push(p);
  }
  return out.sort();
}

const rel = (f: string) => path.relative(WEBSITE, f).split(path.sep).join("/");
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** URL path of a built HTML file, e.g. dist/docs/index.html → /base/docs/ */
function pagePath(file: string): string {
  const r = path.relative(DIST, file).split(path.sep).join("/");
  return BASE_PATH + r.replace(/(^|\/)index\.html$/, "$1");
}

/** dist file for an internal URL path, or null if it is outside BASE_PATH. */
function distFile(urlPath: string): string | null {
  if (!urlPath.startsWith(BASE_PATH)) return null;
  const r = decodeURIComponent(urlPath.slice(BASE_PATH.length));
  const p = path.join(DIST, ...r.split("/"));
  if (r === "" || r.endsWith("/")) return path.join(p, "index.html");
  return p;
}

const htmlFiles = (await files(DIST, /\.html$/)).filter((f) => !f.includes(`${path.sep}pagefind${path.sep}`));
const idCache = new Map<string, Set<string>>();
function ids(file: string): Set<string> {
  let s = idCache.get(file);
  if (!s) {
    s = new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => decode(m[1] ?? "")));
    idCache.set(file, s);
  }
  return s;
}

const siteOrigin = new URL(SITE_URL).origin;
const external = new Set<string>();

// ---------------------------------------------------------------- links + pages
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const here = new URL(pagePath(file), SITE_URL);
  const isDemoReport = rel(file).startsWith("dist/demo/");
  if (!isDemoReport) {
    const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
    if (h1 !== 1) fail("pages", `${rel(file)} has ${h1} <h1> elements`);
    if (!/<title>[^<]+<\/title>/.test(html)) fail("pages", `${rel(file)} has no <title>`);
    if (!/<meta name="description" content="[^"]+"/.test(html))
      fail("pages", `${rel(file)} has no meta description`);
    if (!/<link rel="canonical" href="[^"]+"/.test(html)) fail("pages", `${rel(file)} has no canonical link`);
  }
  for (const m of html.matchAll(/<[^>]*\s(?:href|src)="([^"]*)"[^>]*>/g)) {
    // The 404 page is served for any missing URL; its canonical link is not a real page.
    if (path.basename(file) === "404.html" && /rel="canonical"/.test(m[0])) continue;
    const raw = decode(m[1] ?? "");
    if (!raw || /^(mailto:|tel:|data:|javascript:)/.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, here);
    } catch {
      fail("links", `${rel(file)}: unparseable URL ${raw}`);
      continue;
    }
    if (url.origin !== siteOrigin) {
      if (/^https?:$/.test(url.protocol)) external.add(url.href.replace(/#.*$/, ""));
      continue;
    }
    const target = distFile(url.pathname);
    if (!target) {
      fail("links", `${rel(file)}: ${raw} is outside the base path ${BASE_PATH}`);
      continue;
    }
    if (!existsSync(target) || statSync(target).isDirectory()) {
      fail("links", `${rel(file)}: ${raw} → ${url.pathname} does not exist`);
      continue;
    }
    if (url.hash && target.endsWith(".html")) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (id && !ids(target).has(id)) fail("links", `${rel(file)}: ${raw} → anchor #${id} not found`);
    }
  }
}

// ---------------------------------------------------------------- sitemap + robots
const sitemapFiles = await files(DIST, /^sitemap-\d+\.xml$/);
if (!sitemapFiles.length) fail("sitemap", "no sitemap-*.xml in dist");
for (const f of sitemapFiles) {
  for (const m of readFileSync(f, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = new URL(m[1] ?? "");
    if (u.origin !== siteOrigin) fail("sitemap", `${u.href} is not on ${SITE_URL}`);
    const t = distFile(u.pathname);
    if (!t || !existsSync(t)) fail("sitemap", `${u.href} has no built page`);
    if (u.pathname.includes("404")) fail("sitemap", "the 404 page is listed in the sitemap");
  }
}
const robots = readFileSync(path.join(DIST, "robots.txt"), "utf8");
const expectedSitemap = new URL(`${BASE_PATH}sitemap-index.xml`, SITE_URL).href;
if (!robots.includes(`Sitemap: ${expectedSitemap}`))
  fail("sitemap", `robots.txt does not point to ${expectedSitemap}`);

// ---------------------------------------------------------------- privacy
const TRACKERS =
  /googletagmanager|google-analytics|gtag\(|plausible\.io|umami|segment\.(io|com)|hotjar|mixpanel|fullstory|clarity\.ms|fonts\.googleapis|fonts\.gstatic|document\.cookie/i;
for (const file of await files(DIST, /\.(html|css|js|mjs)$/)) {
  const text = readFileSync(file, "utf8");
  if (TRACKERS.test(text)) fail("privacy", `${rel(file)} references a tracker, third-party font or cookies`);
  if (file.endsWith(".html")) {
    for (const m of text.matchAll(
      /<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*?\s(?:src|href|data)="(https?:\/\/[^"]+)"/g,
    )) {
      const tag = m[1];
      const u = new URL(m[2] ?? "");
      // <link rel="canonical|alternate|sitemap"> are not requests.
      if (tag === "link" && /rel="(canonical|alternate|sitemap)"/.test(m[0])) continue;
      if (u.origin !== siteOrigin) fail("privacy", `${rel(file)} loads ${u.href} at runtime`);
    }
  } else {
    for (const m of text.matchAll(/(?:@import\s+(?:url\()?|url\()\s*["']?(https?:\/\/[^"')\s]+)/g))
      if (new URL(m[1] ?? "").origin !== siteOrigin) fail("privacy", `${rel(file)} loads ${m[1]}`);
  }
}

// ---------------------------------------------------------------- landing-page JavaScript budget
const landing = readFileSync(path.join(DIST, "index.html"), "utf8");
const seen = new Set<string>();
let jsBytes = 0;
function addScript(urlPath: string): void {
  const f = distFile(urlPath);
  if (!f || seen.has(f) || !existsSync(f)) return;
  seen.add(f);
  const text = readFileSync(f, "utf8");
  jsBytes += Buffer.byteLength(text);
  // Static imports only; dynamic import() (search) loads on demand.
  for (const m of text.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^"'()]*?from\s*)?["']([^"']+)["']/g))
    addScript(new URL(m[1] ?? "", new URL(urlPath, SITE_URL)).pathname);
}
for (const m of landing.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g))
  addScript(new URL(decode(m[1] ?? ""), SITE_URL).pathname);
const inline = [...landing.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].reduce(
  (n, m) => n + Buffer.byteLength(m[1] ?? ""),
  0,
);
jsBytes += inline;
for (const m of landing.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g))
  for (const i of (m[1] ?? "").matchAll(/import\s*(?:[^"'()]*?from\s*)?["']([^"']+)["']/g))
    addScript(new URL(i[1] ?? "", SITE_URL + BASE_PATH).pathname);
if (jsBytes > JS_BUDGET)
  fail("budget", `landing page loads ${(jsBytes / 1024).toFixed(1)} KB of JavaScript (budget 100 KB)`);

// ---------------------------------------------------------------- external links (optional)
if (process.argv.includes("--external")) {
  for (const href of [...external].sort()) {
    let status = 0;
    try {
      let r = await fetch(href, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (r.status === 405 || r.status === 403)
        r = await fetch(href, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      status = r.status;
    } catch (e) {
      warnings.push(`[external] ${href}: ${(e as Error).message}`);
      continue;
    }
    if (status === 404 || status === 410) fail("external", `${href} returned ${status}`);
    else if (status >= 400) warnings.push(`[external] ${href} returned ${status}`);
  }
}

for (const w of warnings) console.warn(`warning ${w}`);
if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`\ncheck-site: ${errors.length} problem(s).`);
  process.exit(1);
}
console.log(
  `check-site: ${htmlFiles.length} pages, ${external.size} external links${process.argv.includes("--external") ? " checked" : " (not fetched)"}, landing JS ${(jsBytes / 1024).toFixed(1)} KB, base ${BASE_PATH}: OK`,
);
