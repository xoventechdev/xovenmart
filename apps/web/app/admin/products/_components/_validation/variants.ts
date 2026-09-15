/**
 * Per-row validation for the admin Variants editor. Kept in lockstep with
 * the backend's `validateVariantRow()` helper in
 * `apps/api/src/modules/admin/admin.controller.ts` so the client can show
 * per-row errors BEFORE the user clicks Save (faster feedback than a 400).
 *
 * The server is still the source of truth — its validator throws on the
 * first bad row. Our client validator only returns the first error per
 * row so the UI stays calm (red border + helper text per row, not a
 * wall of red).
 */

export const MAX_VARIANTS_PER_PRODUCT = 30;
export const SKU_SUFFIX_REGEX = /^[A-Za-z0-9-]+$/;
export const MAX_VARIANT_NAME_LENGTH = 40;
export const MAX_VARIANT_SKU_SUFFIX_LENGTH = 8;

export type VariantRowError =
  | "name_required"
  | "name_too_long"
  | "skuSuffix_required"
  | "skuSuffix_too_long"
  | "skuSuffix_invalid"
  | "skuSuffix_duplicate"
  | "priceMrp_required"
  | "priceMrp_negative"
  | "priceSale_required"
  | "priceSale_zero"
  | "priceSale_gt_mrp"
  | "weightGrams_negative"
  | "stockQty_negative";

/**
 * Validate a single variant row against the form-level rules.
 *
 * Returns the first matching error code, or `null` when the row is clean.
 * `siblingSuffixes` are the suffixes already used by OTHER rows so we can
 * catch duplicates inside this form without a server round-trip.
 */
export function validateVariantRow(
  row: {
    name: string;
    skuSuffix: string;
    priceMrp: number;
    priceSale: number;
    weightGrams?: number | null;
    stockQty?: number;
  },
  siblingSuffixes: string[],
): VariantRowError | null {
  const name = (row.name ?? "").trim();
  if (!name) return "name_required";
  if (name.length > MAX_VARIANT_NAME_LENGTH) return "name_too_long";

  const sku = (row.skuSuffix ?? "").trim().toUpperCase();
  if (!sku) return "skuSuffix_required";
  if (sku.length > MAX_VARIANT_SKU_SUFFIX_LENGTH) return "skuSuffix_too_long";
  if (!SKU_SUFFIX_REGEX.test(sku)) return "skuSuffix_invalid";
  // Duplicate inside the form (excluding this row's own position —
  // caller is responsible for passing `siblingSuffixes` without self).
  if (siblingSuffixes.includes(sku)) return "skuSuffix_duplicate";

  if (!Number.isFinite(row.priceMrp)) return "priceMrp_required";
  if (row.priceMrp < 0) return "priceMrp_negative";

  if (!Number.isFinite(row.priceSale)) return "priceSale_required";
  if (row.priceSale <= 0) return "priceSale_zero";
  if (row.priceSale > row.priceMrp) return "priceSale_gt_mrp";

  if (row.weightGrams !== undefined && row.weightGrams !== null) {
    if (!Number.isFinite(row.weightGrams) || row.weightGrams < 0) {
      return "weightGrams_negative";
    }
  }
  if (row.stockQty !== undefined && row.stockQty !== null) {
    if (!Number.isFinite(row.stockQty) || row.stockQty < 0) {
      return "stockQty_negative";
    }
  }
  return null;
}

/**
 * Map an error code to a human-readable message in the active language.
 * Both branches are inline strings — no extra fetch needed.
 */
export function variantErrorMessage(
  err: VariantRowError,
  lang: "bn" | "en",
): string {
  switch (err) {
    case "name_required":
      return lang === "bn" ? "নাম দিতে হবে" : "Name is required";
    case "name_too_long":
      return lang === "bn"
        ? `নাম সর্বোচ্চ ${MAX_VARIANT_NAME_LENGTH} অক্ষর`
        : `Name max ${MAX_VARIANT_NAME_LENGTH} chars`;
    case "skuSuffix_required":
      return lang === "bn" ? "SKU সাফিক্স দিতে হবে" : "SKU suffix is required";
    case "skuSuffix_too_long":
      return lang === "bn"
        ? `SKU সাফিক্স সর্বোচ্চ ${MAX_VARIANT_SKU_SUFFIX_LENGTH} অক্ষর`
        : `SKU suffix max ${MAX_VARIANT_SKU_SUFFIX_LENGTH} chars`;
    case "skuSuffix_invalid":
      return lang === "bn"
        ? "শুধু ইংরেজি অক্ষর, সংখ্যা ও হাইফেন (−)"
        : "Only letters, digits, and hyphens (−)";
    case "skuSuffix_duplicate":
      return lang === "bn"
        ? "এই SKU সাফিক্স অন্য ভ্যারিয়েন্টে আছে"
        : "This SKU suffix is used by another variant";
    case "priceMrp_required":
      return lang === "bn" ? "MRP দিতে হবে" : "MRP is required";
    case "priceMrp_negative":
      return lang === "bn" ? "MRP ০ বা তার বেশি হবে" : "MRP must be ≥ 0";
    case "priceSale_required":
      return lang === "bn" ? "বিক্রয় মূল্য দিতে হবে" : "Sale price is required";
    case "priceSale_zero":
      return lang === "bn"
        ? "বিক্রয় মূল্য ০ এর বেশি হবে"
        : "Sale price must be > 0";
    case "priceSale_gt_mrp":
      return lang === "bn"
        ? "বিক্রয় মূল্য MRP-এর বেশি হতে পারবে না"
        : "Sale price cannot exceed MRP";
    case "weightGrams_negative":
      return lang === "bn"
        ? "ওজন ০ বা তার বেশি হবে"
        : "Weight must be ≥ 0";
    case "stockQty_negative":
      return lang === "bn" ? "স্টক ০ বা তার বেশি হবে" : "Stock must be ≥ 0";
  }
}

/**
 * Build a unique SKU suffix for a new variant row. Caller passes the
 * suffix pool (existing suffix strings + any explicit prefix hint like
 * "S"/"L") and we return the first free candidate. Falls back to a
 * numeric suffix (`-1`, `-2`, …) when no hint is given.
 *
 * Stays client-side; the server's `validateVariantsArray()` will catch
 * any race-condition collisions on save.
 */
export function nextFreeSkuSuffix(
  existing: string[],
  hint?: string,
): string {
  const used = new Set(existing.map((s) => s.toUpperCase()));
  if (hint) {
    const candidate = hint.toUpperCase().trim();
    if (candidate && !used.has(candidate) && SKU_SUFFIX_REGEX.test(candidate)) {
      return candidate;
    }
  }
  for (let i = 1; i < 100; i++) {
    const candidate = `${i}`;
    if (!used.has(candidate)) return candidate;
  }
  // Extremely unlikely fallback (a single product with 100 variants).
  return `${Date.now()}`.slice(-8);
}
