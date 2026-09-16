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
  // CRITICAL: prompt-only JSON. We deliberately do NOT pass
  // `response_format: json_schema` (OpenAI), `input_schema` (Anthropic
  // tool-use), or `responseSchema` (Gemini) because every vendor's
  // strict-mode has its own quirks and a single bug rejects the
  // response across all four vendors. We just ask the model for raw
  // JSON in the system prompt and parse it ourselves — the cheaper,
  // more portable path that works identically on all four.
  const system =
    "You are a product copywriter for a Bangladeshi single-vendor e-commerce shop.\n" +
    "Write clear, helpful, and trustworthy product names + descriptions.\n" +
    "Always produce BOTH Bangla (nameBn, descriptionBn) and English (nameEn, descriptionEn) versions.\n" +
    "\n" +
    "OUTPUT FORMAT — STRICT RULES (do not deviate):\n" +
    "- Reply with ONE valid JSON object only. No prose, no markdown, no code fences.\n" +
    "- Do not write anything before or after the JSON object.\n" +
    "- Use exactly these five fields and no others:\n" +
    '  {"nameBn": "<string>", "nameEn": "<string>", "descriptionBn": "<string>", "descriptionEn": "<string>", "tags": ["<string>", ...]}\n' +
    "- nameBn / nameEn: 2 to 80 characters each.\n" +
    "- descriptionBn / descriptionEn: 20 to 600 characters each.\n" +
    "- tags: 1 to 6 short lowercase strings, each under 24 chars.\n" +
    "\n" +
    "CONTENT RULES:\n" +
    "- Keep names short (under 60 chars preferred). Descriptions 80-180 chars preferred.\n" +
    "- Do NOT include the shop name, prices, units of measure, or SKU in the name.\n" +
    "- Do NOT make up specific facts (origin year, certifications, etc.) that weren't given.\n" +
    "- If the existing draft is empty, propose a fresh draft from the category/unit/brand hints.\n" +
    "- If the existing draft is partial, keep what's there and only fill what's missing.";

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
  parts.push("");
  parts.push("Now reply with ONLY the JSON object. No other text.");

  return { system, user: parts.join("\n") };
}
