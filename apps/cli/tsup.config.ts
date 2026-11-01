import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  homepage?: string;
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node26",
  platform: "node",
  clean: true,
  sourcemap: false,
  splitting: false,
  // Internal workspace packages are bundled; third-party deps stay external.
  noExternal: [/^@tokenwise\//],
  banner: { js: "#!/usr/bin/env node" },
  // Rule findings link to <homepage>docs/reference/rules/#<id> once a homepage is set.
  define: { __TOKENWISE_HOMEPAGE__: JSON.stringify(pkg.homepage ?? "") },
});
