import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Renders extension/icons/icon.svg to the PNG sizes Chrome asks for.
// Kept as a script rather than committing the PNGs as unexplained
// binaries — the SVG stays the source of truth and anyone can
// regenerate identical output with `npx tsx scripts/generate-extension-icons.ts`.
//
// `sharp` is already present as a Next.js image-optimization dependency,
// so this needs no extra install.

const SIZES = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, "..", "extension", "icons");
const svgPath = path.join(iconsDir, "icon.svg");

async function main() {
  const svg = readFileSync(svgPath);

  for (const size of SIZES) {
    const outPath = path.join(iconsDir, `icon${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(outPath);
    console.log(`[icons] wrote ${path.relative(process.cwd(), outPath)}`);
  }
}

main().catch((err) => {
  console.error("[icons] failed:", err);
  process.exit(1);
});
