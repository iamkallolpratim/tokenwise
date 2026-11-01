import { defineEcConfig } from "@astrojs/starlight/expressive-code";

/**
 * Code blocks scroll horizontally inside their own frame. A scrollable region must be reachable by
 * keyboard (WCAG 2.1.1, axe "scrollable-region-focusable"), so every <pre> gets tabindex="0".
 */
function focusableCodeBlocks() {
  const visit = (node) => {
    if (node.type === "element" && node.tagName === "pre")
      node.properties = { ...node.properties, tabindex: "0" };
    for (const child of node.children ?? []) visit(child);
  };
  return {
    name: "focusable-code-blocks",
    hooks: {
      postprocessRenderedBlock: ({ renderData }) => visit(renderData.blockAst),
    },
  };
}

export default defineEcConfig({ plugins: [focusableCodeBlocks()] });
