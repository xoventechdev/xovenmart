/**
 * backfill-address-area.ts
 *
 * One-off operator script: replace NULL / empty `Address.area` values
 * with the placeholder "—" so the column is never blank for the new
 * uniform-address flows (which don't ask the user for an area).
 *
 * Run from the repo root (NOT during deploy — operator-only):
 *
 *   pnpm --filter @xovenmart/api exec ts-node scripts/backfill-address-area.ts
 *   # or, if you're already in apps/api:
 *   pnpm exec ts-node scripts/backfill-address-area.ts
 *
 * Idempotent: rows whose `area` is already non-empty (incl. already "—")
 * are skipped. Safe to re-run.
 *
 * Optional env knobs:
 *   DATABASE_URL  — defaults to whatever .env provides
 *   DRY_RUN=1     — print the would-be updates without writing
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PLACEHOLDER = "—";
const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  // Find rows whose area is missing or empty. Trim-aware so rows like
  // "   " also get touched (they'd otherwise fail the address DTO's
  // MinLength(1) validator).
  const targets = await prisma.address.findMany({
    where: {
      OR: [{ area: null }, { area: "" }],
    },
    select: { id: true, area: true },
  });

  let touched = 0;
  for (const a of targets) {
    touched += 1;
    if (!DRY_RUN) {
      await prisma.address.update({
        where: { id: a.id },
        data: { area: PLACEHOLDER },
      });
    }
  }

  console.log(`[backfill-address-area] total_missing_or_empty=${targets.length} touched=${touched} dryRun=${DRY_RUN}`);
  console.log(
    `[backfill-address-area] placeholder='${PLACEHOLDER}' (single em-dash)`,
  );
}

main()
  .catch((e) => {
    console.error("[backfill-address-area] failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
