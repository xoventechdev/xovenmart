// scripts/copy-brand-assets.mjs
// Run this ONCE to copy the master brand PNG from the project root
// into the Next.js public/ folder so <BrandLogo /> can serve it.
//
// Usage (from apps/web/):
//   node scripts/copy-brand-assets.mjs
//
// Source:  E:\App Ideas\XovenMart v1\XovenMart logo.png
// Targets:
//   apps/web/public/logo.png        (full lockup)
//   apps/web/public/logo-mark.png   (cropped icon — same source for now)
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCE = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "XovenMart logo.png"
);

const TARGETS = [
  resolve(__dirname, "..", "public", "logo.png"),
  resolve(__dirname, "..", "public", "logo-mark.png"),
];

if (!existsSync(SOURCE)) {
  console.error(`[brand] Source not found: ${SOURCE}`);
  console.error("[brand] Make sure the file 'XovenMart logo.png' is in the project root.");
  process.exit(1);
}

for (const target of TARGETS) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(SOURCE, target);
  console.log(`[brand] Copied → ${target}`);
}

console.log("[brand] Done.");
