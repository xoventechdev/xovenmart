#!/usr/bin/env node
/**
 * Bulk-import root categories into the live XovenMart API from
 * `tech/catagory-live.txt`. Run with:
 *
 *   ADMIN_EMAIL=admin@xovenmart.com \
 *   ADMIN_PASSWORD='…' \
 *   node apps/api/scripts/import-categories.mjs
 *
 * Optional env vars:
 *   API_BASE      default: https://api.xovenmart.com/api/v1
 *   SOURCE_FILE   default: <repo-parent>/catagory-live.txt
 *                       (the `tech/` folder lives next to the repo root)
 *   DRY_RUN=1     log payload without POSTing
 *
 * What it does:
 *   1. Reads `catagory-live.txt` (markdown table; # / EN / BN / slug).
 *   2. Logs in as the bootstrap admin via POST /auth/admin/login.
 *   3. Fetches the live category list (so we can skip duplicates by slug).
 *   4. POSTs each new category to /admin/categories with a curated
 *      Unsplash hero image. Images are URL-only — the server stores
 *      the string verbatim. Host (images.unsplash.com) is already
 *      whitelisted in apps/web/next.config.js.
 *
 * Safe to re-run: already-existing slugs are skipped (idempotent).
 *
 * Why a standalone Node script (not a Prisma seed):
 *   - The DB on Coolify isn't reachable from a dev machine — only the
 *     HTTP API is exposed. So we hit the same admin endpoints the web
 *     form hits, with the same auth flow.
 *   - Keeps audit-log row (entity: "category", action: "create")
 *     consistent with manual admin actions.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/scripts/ → apps/api/ → apps/ → <repo-root>
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
// The `tech/` folder lives next to the repo, not inside it
// (E:\App Ideas\XovenMart v1\tech\catagory-live.txt).
const TECH_ROOT = resolve(REPO_ROOT, "..");

const API_BASE = (process.env.API_BASE ?? "https://api.xovenmart.com/api/v1").replace(/\/$/, "");
const SOURCE_FILE = process.env.SOURCE_FILE ?? resolve(TECH_ROOT, "catagory-live.txt");
const DRY_RUN = process.env.DRY_RUN === "1";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if ((!ADMIN_EMAIL || !ADMIN_PASSWORD) && !DRY_RUN) {
  console.error(
    "✖ Missing credentials. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.\n" +
      "  Example:\n" +
      "    ADMIN_EMAIL=admin@xovenmart.com ADMIN_PASSWORD='…' node apps/api/scripts/import-categories.mjs",
  );
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Curated Unsplash photos (one per category). Each ID is a stable
// Unsplash photo ID; the URL pattern matches the seed's `unsplash()`
// helper at packages/db/prisma/seed.ts:52 so the next/image optimizer
// picks them up the same way. Picked by hand from public Unsplash
// search to roughly match each category's visual theme.
// ─────────────────────────────────────────────────────────────────────────────

const UNSPLASH_IMAGES = {
  grocery: "1542838132-92c53300491e",
  "fast-food": "1568901346375-23c9450c58cd",
  biryani: "1563379091339-03b21ab4a4f8",
  "fish-meat": "1607623814075-e51df1bdc82f",
  vegetables: "1540420773420-3366772f4999",
  fruits: "1619566636851-adf3ef29300f",
  cosmetics: "1596462502278-27bfdc403348",
  clothing: "1489987707025-afc232f7ea0f",
  confectionery: "1481391319762-47dff72954d9",
  stationery: "1583485088034-697b5bc36b92",
  medicine: "1587854692152-cbe660dbde88",
  "organic-food": "1542838132-92c53300491e",
  toys: "1558060370-d644479cb6f7",
  "bakery-cakes": "1565958011703-44f9829ba187",
  sweets: "1551024506-0bccd828d307",
  dairy: "1559561853-4e1d8c4e2c99",
  beverages: "1556679343-c7306c1976bc",
  snacks: "1599490659213-e2b9527bd087",
  "baby-products": "1519689680058-324335c77eba",
  "shoes-sandals": "1542291026-7eec264c27ff",
  "bags-travel": "1553062407-98eeb64c6a62",
  electronics: "1593344484962-796055d4a3a4",
  "mobile-accessories": "1601784551446-20c9e07cdbdb",
  household: "1583947215259-38e31be8751f",
  kitchen: "1556909114-f6e7ad7d3136",
  agriculture: "1574323347407-f5e1ad6d020b",
  "pet-animal-supplies": "1450778869180-41d0601e046e",
  "flowers-gifts": "1490750967868-88aa4486c946",
  "party-event": "1530103862676-de8c9debad1d",
};

// Already-live slugs (per the user). Skipped on import.
const ALREADY_LIVE = new Set(["biryani", "fast-food"]);

// ─────────────────────────────────────────────────────────────────────────────
// Parse the markdown table
// ─────────────────────────────────────────────────────────────────────────────

function parseSource(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 4) continue;
    // Header row: "#", "বাংলা নাম", "English Name", "URL Identifier"
    if (cells[0] === "#" || cells[0] === "--") continue;
    const [_num, nameBnRaw, nameEnRaw, slug] = cells;
    if (!nameEnRaw || !slug) continue;
    rows.push({
      nameBn: nameBnRaw.replace(/^\*+|\*+$/g, "").trim(),
      nameEn: nameEnRaw.replace(/^\*+|\*+$/g, "").trim(),
      slug: slug.replace(/^\*+|\*+$/g, "").trim(),
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message ?? res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${Array.isArray(msg) ? msg.join(", ") : msg}`);
  }
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`▶ API_BASE:    ${API_BASE}`);
  console.log(`▶ SOURCE_FILE: ${SOURCE_FILE}`);
  console.log(`▶ DRY_RUN:     ${DRY_RUN}`);

  const raw = readFileSync(SOURCE_FILE, "utf8");
  const parsed = parseSource(raw);
  console.log(`▶ Parsed ${parsed.length} rows from source`);

  let token;
  let existingSlugs = new Set();
  if (!DRY_RUN) {
    // 1) Login
    console.log("\n▶ Logging in as admin…");
    const loginRes = await api("POST", "/auth/admin/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    token = loginRes.accessToken ?? loginRes.access_token;
    if (!token) {
      throw new Error("Login succeeded but no access token in response");
    }
    console.log("  ✓ Authenticated");

    // 2) Fetch existing categories so we can skip duplicates by slug
    console.log("\n▶ Fetching existing categories…");
    const existing = await api("GET", "/admin/categories", { token });
    existingSlugs = new Set(existing.map((c) => c.slug));
    console.log(`  ✓ ${existing.length} categories already live`);
    for (const c of existing) {
      console.log(`    • /${c.slug}  ${c.nameEn}`);
    }
  } else {
    console.log("\n— DRY RUN — skipping login + existing-list fetch");
  }

  // 3) Build the import list
  const toImport = parsed.filter((row) => {
    if (ALREADY_LIVE.has(row.slug)) return false;
    if (existingSlugs.has(row.slug)) return false;
    return true;
  });

  console.log(`\n▶ ${toImport.length} categories to import (skipped ${parsed.length - toImport.length} already-live / duplicates)`);

  if (DRY_RUN) {
    console.log("\n— DRY RUN — would POST:");
    for (const row of toImport) {
      const payload = buildPayload(row, toImport.indexOf(row));
      console.log(JSON.stringify(payload, null, 2));
    }
    return;
  }

  // 4) POST them one at a time. Sequential on purpose: admin POSTs
  //    create audit-log rows, and the uniqueSlug logic is in-memory,
  //    so parallel writes could collide on the `-1 / -2` suffix.
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < toImport.length; i++) {
    const row = toImport[i];
    const payload = buildPayload(row, i);
    const label = `${String(i + 1).padStart(2)}/${toImport.length}  /${payload.slug.padEnd(22)} ${payload.nameEn}`;
    try {
      const created = await api("POST", "/admin/categories", { token, body: payload });
      console.log(`  ✓ ${label} → id=${created.id}`);
      ok++;
    } catch (e) {
      console.error(`  ✖ ${label}\n     ${e.message}`);
      failed++;
    }
  }

  console.log(`\n▶ Done: ${ok} created, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

function buildPayload(row, sortOrder) {
  const photoId = UNSPLASH_IMAGES[row.slug];
  return {
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    slug: row.slug,
    parentId: null,
    sortOrder,
    isActive: true,
    // Curated Unsplash photo (or undefined → no image; the form just
    // leaves imageUrl null). The host whitelist in
    // apps/web/next.config.js covers images.unsplash.com.
    ...(photoId
      ? {
          imageUrl: `https://images.unsplash.com/photo-${photoId}?w=600&q=80&auto=format&fit=crop`,
        }
      : {}),
  };
}

main().catch((e) => {
  console.error("\n✖ Fatal:", e.message);
  process.exit(1);
});
