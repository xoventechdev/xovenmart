/**
 * Versioned prompt templates + response schemas for every AI feature
 * the shop uses. New features (alt-text, customer reply, search
 * rewriter, …) each get a `v{N}_{feature}` entry here so we can
 * evolve prompts without touching controller code.
 *
 * Why a function instead of a constant:
 *   Some vendors cache prompts by hash for cost-saving; mixing
 *   dynamic state (current month, etc.) into the prompt would defeat
 *   that. We keep system+user as pure functions of the input.
 *
 * Why bilingual:
 *   The shop is BD-first. The model writes BOTH `nameBn` (Bangla)
 *   and `nameEn` (English) so admins don't have to translate.
 */

export const PRODUCT_COPY_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nameBn", "nameEn", "descriptionBn", "descriptionEn", "tags"],
  properties: {
    nameBn: {
      type: "string",
      description: "Bangla display name (2-80 chars).",
    },
    nameEn: {
      type: "string",
      description: "English display name (2-80 chars).",
    },
    descriptionBn: {
      type: "string",
      description: "Bangla marketing description (20-600 chars).",
    },
    descriptionEn: {
      type: "string",
      description: "English marketing description (20-600 chars).",
    },
    tags: {
      type: "array",
      description: "Up to 6 short lowercase tags for search.",
      items: { type: "string" },
    },
  },
} as const;

/** The shape we get back from the LLM after JSON-parse + schema-validate. */
export interface ProductCopyResult {
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  tags: string[];
}

export interface ProductCopyInput {
  /** Existing draft (may be empty) — used to preserve intent on a re-roll. */
  nameBn?: string;
  nameEn?: string;
  descriptionBn?: string;
  descriptionEn?: string;
  /** Free-text category label ("Grocery", "Electronics"). Optional. */
  categoryName?: string;
  /** Unit label from the catalog ("kg", "pcs", "ml"). Optional. */
  unit?: string;
  /** Brand or supplier name (optional; passed through verbatim). */
  brand?: string;
}

/**
 * Build the system + user prompt pair for the product-copy feature.
 *
 * The system prompt is stable across calls so vendor prompt caches
 * (where they exist) can kick in. Only the user prompt carries the
 * per-product data.
 *
 * NOTE: We deliberately do NOT pass the admin user id, customer
 * names, audit log contents, or any other PII. The only inputs are
 * the product text fields + the category / unit context.
 */
export function buildProductCopyPrompt(input: ProductCopyInput): {
  system: string;
  user: string;
} {
  const system =
    "You are a product copywriter for a Bangladeshi single-vendor e-commerce shop.\n" +
    "Write clear, helpful, and trustworthy product names + descriptions.\n" +
    "Always produce BOTH Bangla (nameBn, descriptionBn) and English (nameEn, descriptionEn) versions.\n" +
    "Use the provided JSON schema exactly. Do not invent fields.\n" +
    "If the existing draft is empty, propose a fresh draft from the category/unit/brand hints.\n" +
    "If the existing draft is partial, keep what's there and only fill what's missing.\n" +
    "Keep names short (under 60 chars preferred). Descriptions 80-180 chars preferred.\n" +
    "Tags: lowercase, single-word or hyphenated, search-friendly.\n" +
    "Do NOT include the shop name, prices, units of measure, or SKU in the name.\n" +
    "Do NOT make up specific facts (origin year, certifications, etc.) that weren't given.";

  const parts: string[] = [];
  parts.push("Generate / improve product copy from the hints below.");
  parts.push("");
  if (input.nameEn?.trim()) parts.push(`Existing name (EN): ${input.nameEn.trim()}`);
  if (input.nameBn?.trim()) parts.push(`Existing name (BN): ${input.nameBn.trim()}`);
  if (input.descriptionEn?.trim()) parts.push(`Existing description (EN): ${input.descriptionEn.trim()}`);
  if (input.descriptionBn?.trim()) parts.push(`Existing description (BN): ${input.descriptionBn.trim()}`);
  if (input.categoryName?.trim()) parts.push(`Category: ${input.categoryName.trim()}`);
  if (input.unit?.trim()) parts.push(`Unit: ${input.unit.trim()}`);
  if (input.brand?.trim()) parts.push(`Brand: ${input.brand.trim()}`);
  if (parts.length === 1) {
    parts.push(
      "(No hints provided — propose a generic placeholder the admin can edit, e.g. for a Grocery item.)",
    );
  }

  return { system, user: parts.join("\n") };
}
