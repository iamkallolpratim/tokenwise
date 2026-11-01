// Renders the committed raster assets from SVG with sharp (run by hand after changing the design):
//   public/og.png (1200×630), public/favicon-32.png, public/apple-touch-icon.png (180×180).
// public/favicon.svg is the vector source used by modern browsers.
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PUBLIC, WEBSITE } from "./lib/paths.ts";

const mark = readFileSync(path.join(WEBSITE, "src", "assets", "mark.svg"));

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0d1117"/>
  <rect x="0" y="0" width="1200" height="8" fill="#2aa57a"/>
  <g transform="translate(96 150) scale(3.4)">
    <rect width="32" height="32" rx="7" fill="#0b7a55"/>
    <rect x="7" y="8.5" width="18" height="3" rx="1.5" fill="#fff"/>
    <rect x="7" y="14.5" width="13" height="3" rx="1.5" fill="#fff"/>
    <rect x="7" y="20.5" width="8" height="3" rx="1.5" fill="#fff"/>
  </g>
  <text x="96" y="370" font-family="Helvetica, Arial, sans-serif" font-size="104" font-weight="700" fill="#f0f6fc">TokenWise</text>
  <text x="96" y="450" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#a8ecd2">Reduce token waste. Preserve intelligence.</text>
  <text x="96" y="530" font-family="Menlo, Consolas, monospace" font-size="28" fill="#9da7b3">Local-first CLI for agent instructions, skills and tool schemas</text>
</svg>`;

await sharp(Buffer.from(og)).png().toFile(path.join(PUBLIC, "og.png"));
await sharp(mark, { density: 300 }).resize(32, 32).png().toFile(path.join(PUBLIC, "favicon-32.png"));
await sharp(mark, { density: 600 })
  .resize(180, 180)
  .flatten({ background: "#0b7a55" })
  .png()
  .toFile(path.join(PUBLIC, "apple-touch-icon.png"));
console.log("wrote public/og.png, public/favicon-32.png, public/apple-touch-icon.png");
