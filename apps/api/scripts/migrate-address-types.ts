/**
 * migrate-address-types.ts
 *
 * One-off operator script: backfill the new `Address.type` enum from the
 * legacy free-text `Address.label` column.
 *
 * Run from the repo root (NOT during deploy — operator-only):
 *
 *   pnpm --filter @xovenmart/api exec ts-node scripts/migrate-address-types.ts
 *   # or, if you're already in apps/api:
 *   pnpm exec ts-node scripts/migrate-address-types.ts
 *
 * Mapping:
 *   label == "Home"  | "home"  | "HOME"   → type = HOME
 *   label == "Office"| "office"| "OFFICE" → type = OFFICE
 *   everything else (incl. NULL, "Mom's house", …) → OTHER
 *
 * Idempotent: rows whose type is already correct are skipped. Safe to re-run.
 *
 * Optional env knobs:
 *   DATABASE_URL         — defaults to whatever .env provides
 *   DRY_RUN=1            — print the would-be updates without writing
 */

import { PrismaClient, AddressType } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";

function classify(label: string | null | undefined): AddressType {
  const trimmed = (label ?? "").trim().toLowerCase();
  if (trimmed === "home") return AddressType.HOME;
  if (trimmed === "office") return AddressType.OFFICE;
  return AddressType.OTHER;
}

async function main() {
  const addresses = await prisma.address.findMany({
    select: { id: true, label: true, type: true },
  });

  let touched = 0;
  let unchanged = 0;
  const buckets: Record<AddressType, number> = {
    [AddressType.HOME]: 0,
    [AddressType.OFFICE]: 0,
    [AddressType.OTHER]: 0,
  };

  for (const a of addresses) {
    const next = classify(a.label);
    buckets[next] += 1;
    if (a.type === next) {
      unchanged += 1;
      continue;
    }
    touched += 1;
    if (!DRY_RUN) {
      await prisma.address.update({
        where: { id: a.id },
        data: { type: next },
      });
    }
  }

  console.log(`[migrate-address-types] total=${addresses.length}`);
  console.log(`[migrate-address-types] touched=${touched} unchanged=${unchanged} dryRun=${DRY_RUN}`);
  console.log(`[migrate-address-types] bucket counts: HOME=${buckets.HOME} OFFICE=${buckets.OFFICE} OTHER=${buckets.OTHER}`);
}

main()
  .catch((e) => {
    console.error("[migrate-address-types] failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
