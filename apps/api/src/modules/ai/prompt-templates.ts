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
  required: ["nameBn", "nameEn", "descriptionBn", "descriptionEn", "tags", "categoryName", "unit"],
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
    categoryName: {
      type: "string",
      description:
        "Exact nameEn (or nameBn) of one of the categories listed in the user prompt. Empty string if no list was provided or no good fit.",
    },
    unit: {
      type: "string",
      description:
        "One of the unit values listed in the user prompt (e.g. kg, pcs, L, pack). Empty string if no list was provided or no good fit.",
    },
  },
} as const;

/**
 * Shape we get back from the LLM (raw JSON parsed) — has the model's
 * picks for categoryName and unit (strings), plus the four name/
 * description fields and tags. The service re-validates and resolves
 * categoryName → categoryId and unit → whitelist-validated value.
 */
export interface ProductCopyLlmOutput {
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  tags: string[];
  categoryName: string;
  unit: string;
}

/**
 * Final shape returned by the service after LLM parsing + server-side
 * resolution. Includes both the LLM-derived fields and the server-
 * resolved fields. This is what hits the wire.
 */
export interface ProductCopyResult {
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  tags: string[];
  /**
   * Server-derived slug from the FINAL `nameEn` (after the preserve-
   * admin-input rule). The LLM is NOT expected to set this — the
   * service overwrites whatever the model returns. Always present on
   * the wire response.
   */
  slug: string;
  /**
   * Server-resolved categoryId from the LLM's `categoryName` pick.
   * Null if the LLM didn't pick, didn't match, or no list was supplied.
   */
  categoryId: string | null;
  /**
   * Server-validated unit value. Either the LLM's pick (if in
   * `unitOptions`) or the admin's existing input.unit. Always a
   * non-empty string when the admin typed one.
   */
  unit: string;
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
  /**
   * Full category tree (id + nameBn + nameEn + children). The LLM is
   * asked to pick one entry by its exact name. The service resolves
   * the pick back to a `categoryId`.
   */
  categories?: { id: string; nameBn: string; nameEn: string; children?: any[] }[];
  /**
   * Allowed unit values (e.g. ["kg","pcs","L","pack"]). The LLM is
   * asked to pick one of these or leave blank. The service discards
   * any value not in the list.
   */
  unitOptions?: string[];
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
    "- Use exactly these seven fields and no others:\n" +
    '  {"nameBn": "<string>", "nameEn": "<string>", "descriptionBn": "<string>", "descriptionEn": "<string>", "tags": ["<string>", ...], "categoryName": "<string>", "unit": "<string>"}\n' +
    "- nameBn / nameEn: 2 to 80 characters each.\n" +
    "- descriptionBn / descriptionEn: 20 to 600 characters each.\n" +
    "- tags: 1 to 6 short lowercase strings, each under 24 chars.\n" +
    "- categoryName: the EXACT nameEn (or nameBn) of one entry from the category list in the user prompt. Empty string if no list or no good fit. The server RESOLVES this to a category id; any value that doesn't match exactly is dropped.\n" +
    "- unit: one of the allowed unit strings from the user prompt (e.g. \"kg\"). Empty string if no list or no good fit. The server DROPS any value not in the list.\n" +
    "\n" +
    "CONTENT RULES:\n" +
    "- Keep names short (under 60 chars preferred). Descriptions 80-180 chars preferred.\n" +
    "- Do NOT include the shop name, prices, units of measure, or SKU in the name.\n" +
    "- Do NOT make up specific facts (origin year, certifications, etc.) that weren't given.\n" +
    "- If the existing draft is empty, propose a fresh draft from the category/unit/brand hints.\n" +
    "- If the existing draft is partial, keep what's there and only fill what's missing.\n" +
    "\n" +
    "NAME FIELD RULES (nameBn, nameEn) — STRICT (server-enforced):\n" +
    "\n" +
    "For BOTH nameBn and nameEn, the rule is the same when the admin has already typed something: WORDS ARE LOCKED.\n" +
    "- You may ONLY make character-level spelling corrections INSIDE a word.\n" +
    "- You MUST NOT add, remove, or reorder words.\n" +
    "- You MUST NOT split one word into multiple, or join multiple words into one.\n" +
    "\n" +
    "Bengali (nameBn) examples:\n" +
    "  • Allowed:  \"অম\" → \"আম\" (one-char typo inside the only word)\n" +
    "  • Allowed:  \"পাকা আম\" → \"পাকা আম\" (no change)\n" +
    "  • Allowed:  \"পকা আম\" → \"পাকা আম\" (small fix inside the first word)\n" +
    "  • Forbidden: \"পাকা আম\" → \"আম\"              (removed a word)\n" +
    "  • Forbidden: \"পাকা আম\" → \"পাকা মিষ্টি আম\" (added a word)\n" +
    "  • Forbidden: \"পাকা আম\" → \"আম পাকা\"        (reordered words)\n" +
    "  • Forbidden: \"আম\" → \"মিষ্টি ও রসালো আম\" (added adjectives)\n" +
    "\n" +
    "English (nameEn) examples:\n" +
    "  • Allowed:  \"Mago\" → \"Mango\"            (typo inside the only word)\n" +
    "  • Allowed:  \"Ripe Mango\" → \"Ripe Mango\" (no change)\n" +
    "  • Forbidden: \"Ripe Mango\" → \"Mango\"                (removed a word)\n" +
    "  • Forbidden: \"Ripe Mango\" → \"Sweet Ripe Mango\"     (added a word)\n" +
    "  • Forbidden: \"Mango\" → \"Premium Organic Mango\"    (added adjectives)\n" +
    "\n" +
    "When the name field is EMPTY (no admin input):\n" +
    "- Propose a plain noun from the category/unit/brand hints.\n" +
    "- 1 to 3 words max. NEVER add adjectives like \"premium\", \"fresh\", \"organic\", \"delicious\", \"juicy\", or Bengali \"মিষ্টি\", \"রসালো\", \"তাজা\", \"প্রিমিয়াম\".\n" +
    "  • Example (empty): category=Grocery, unit=kg → nameBn: \"চাল\", nameEn: \"Rice\" (NOT \"Premium Basmati Rice\").\n" +
    "  • Example (empty): category=Cosmetics, brand=L'Oréal → nameEn: \"L'Oréal Cream\" (NOT \"Premium L'Oréal Anti-Aging Cream\").\n" +
    "\n" +
    "The SERVER validates every name against the word-lock rule and discards any LLM value that adds, removes, or reorders words. Returning a clean word-locked value lets the response go through without an override warning.\n" +
    "\n" +
    "DESCRIPTION FIELD RULES (descriptionBn, descriptionEn):\n" +
    "- Descriptions ARE marketing copy — it's fine to be descriptive and appealing here.\n" +
    "- 80-180 characters preferred. Use the category/unit/brand hints to write a helpful, trustworthy pitch.";

  const parts: string[] = [];
  parts.push("Generate / improve product copy from the hints below.");
  parts.push("");
  if (input.nameEn?.trim()) parts.push(`Existing name (EN): ${input.nameEn.trim()}`);
  if (input.nameBn?.trim()) parts.push(`Existing name (BN): ${input.nameBn.trim()}`);
  if (input.descriptionEn?.trim()) parts.push(`Existing description (EN): ${input.descriptionEn.trim()}`);
  if (input.descriptionBn?.trim()) parts.push(`Existing description (BN): ${input.descriptionBn.trim()}`);
  if (input.categoryName?.trim()) parts.push(`Currently chosen category: ${input.categoryName.trim()}`);
  if (input.unit?.trim()) parts.push(`Currently chosen unit: ${input.unit.trim()}`);
  if (input.brand?.trim()) parts.push(`Brand: ${input.brand.trim()}`);

  // Category list (if provided). Format the same way the admin sees in
  // the dropdown — paths include the parent for sub-categories so the
  // LLM picks the most specific one.
  if (input.categories && input.categories.length > 0) {
    const lines: string[] = [];
    const walk = (
      cats: { id: string; nameBn: string; nameEn: string; children?: any[] }[],
      parents: { bn: string; en: string }[],
    ) => {
      for (const c of cats) {
        const bnPath = [...parents.map((p) => p.bn), c.nameBn].filter(Boolean).join(" › ");
        const enPath = [...parents.map((p) => p.en), c.nameEn].filter(Boolean).join(" › ");
        lines.push(`  - EN: "${enPath || c.nameEn}"  /  BN: "${bnPath || c.nameBn}"`);
        if (c.children?.length) {
          walk(
            c.children,
            [...parents, { bn: c.nameBn, en: c.nameEn }],
          );
        }
      }
    };
    walk(input.categories, []);
    parts.push("");
    parts.push("Available categories (pick the EXACT nameEn OR nameBn that best fits the product):");
    parts.push(...lines);
  }

  // Unit whitelist (if provided).
  if (input.unitOptions && input.unitOptions.length > 0) {
    parts.push("");
    parts.push(`Allowed units (pick ONE of these exactly, or leave blank): ${input.unitOptions.join(", ")}`);
  }

  if (parts.length === 1) {
    parts.push(
      "(No hints provided — propose a generic placeholder the admin can edit, e.g. for a Grocery item.)",
    );
  }
  parts.push("");
  parts.push("Now reply with ONLY the JSON object. No other text.");

  return { system, user: parts.join("\n") };
}
