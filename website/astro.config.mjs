import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { BASE_PATH, REPO_BRANCH, REPO_URL, SITE_URL } from "./site.config.mjs";

const abs = (p) => new URL(`${BASE_PATH}${p}`, SITE_URL).href;

/** Starlight lets wide tables scroll sideways; a scrollable region must be keyboard-focusable. */
function focusableTables() {
  const visit = (node) => {
    if (node.type === "element" && node.tagName === "table")
      node.properties = { ...node.properties, tabindex: "0" };
    for (const child of node.children ?? []) visit(child);
  };
  return (tree) => visit(tree);
}

const group = (label, dir, slugs) => ({ label, items: slugs.map((s) => `docs/${dir ? `${dir}/` : ""}${s}`) });

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: "always",
  markdown: { rehypePlugins: [focusableTables] },
  integrations: [
    starlight({
      title: "TokenWise",
      description:
        "A local-first CLI and agent skills that find and reduce unnecessary LLM token usage in prompts, agent instructions, skills and tool schemas, without changing behavior.",
      favicon: "/favicon.svg",
      logo: { src: "./src/assets/mark.svg", alt: "" },
      customCss: ["./src/styles/theme.css"],
      components: { PageTitle: "./src/components/PageTitle.astro" },
      // src/pages/404.astro replaces Starlight's 404 so its links carry the base path.
      disable404Route: true,
      social: REPO_URL ? [{ icon: "github", label: "TokenWise on GitHub", href: REPO_URL }] : [],
      ...(REPO_URL ? { editLink: { baseUrl: `${REPO_URL}/edit/${REPO_BRANCH}/website/` } } : {}),
      head: [
        { tag: "meta", attrs: { property: "og:image", content: abs("og.png") } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "TokenWise: Reduce token waste. Preserve intelligence.",
          },
        },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: abs("og.png") } },
        {
          tag: "link",
          attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: `${BASE_PATH}favicon-32.png` },
        },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: `${BASE_PATH}apple-touch-icon.png` } },
      ],
      sidebar: [
        { label: "Introduction", slug: "docs" },
        group("Getting started", "getting-started", ["installation", "quickstart", "configuration"]),
        group("Guides", "guides", [
          "optimizing-claude-md",
          "optimizing-agents-md",
          "tool-schemas",
          "rag-and-agent-loops",
          "benchmarking-and-evals",
          "usage-logs",
          "using-in-ci",
        ]),
        group("Agent skills", "agent-skills", ["claude-code", "codex", "hooks"]),
        group("Reference", "reference", ["cli", "rules", "config-schema", "report-format", "exit-codes"]),
        group("Concepts", "concepts", [
          "how-it-works",
          "token-counting",
          "efficiency-score",
          "safety-guarantees",
        ]),
        group("Help", "", ["privacy", "limitations", "troubleshooting", "roadmap"]),
        group("Project", "project", ["contributing", "architecture", "decisions", "sources", "releasing"]),
        { label: "Changelog", slug: "docs/changelog" },
      ],
    }),
  ],
});
