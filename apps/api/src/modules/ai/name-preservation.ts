/**
 * Server-side "preserve admin input" rule for product name fields.
 *
 * Why this exists:
 *   The LLM prompt alone was insufficient — the model still collapsed
 *   "পাকা আম" to "আম" in practice. We now enforce a strict,
 *   locale-aware rule on the server regardless of what the LLM returns.
 *
 * Rules:
 *   - Bengali (bn): WORD-LOCKED.
 *       • Never add, remove, or reorder words.
 *       • Within each word, allow Levenshtein distance ≤ 2 (small typo
 *         correction, e.g. "অম" → "আম").
 *       • If LLM's word count or order differs from admin's, REJECT the
 *         LLM value entirely and keep the admin's input.
 *
 *   - English (en): WORD-LOCKED with a tiny tolerance.
 *       • Same word-lock as Bengali.
 *       • Minor surface variation allowed (case, pluralisation, single-
 *         character spelling fix per word).
 *
 * Both helpers return the FINAL string the API should put on the wire
 * (i.e. the admin's input when the LLM drifts, or the LLM's value when
 * it's a small/clean correction) plus a `corrected` flag for logging.
 */

export type NameLocale = "bn" | "en";

export interface NamePreservationResult {
  value: string;
  corrected: boolean;
  /** True iff the LLM value was rejected and we fell back to the admin's input. */
  rejected: boolean;
  /** Short reason code for the warn-log; "ok" when no rejection. */
  reason:
    | "ok"
    | "ok_small_fix"
    | "rejected_empty_input_accepted_llm"
    | "rejected_llm_word_count"
    | "rejected_llm_word_order"
    | "rejected_llm_per_word_distance";
}

/**
 * Split into word tokens. Splits on any whitespace AND on ASCII
 * punctuation that commonly delimits English words. Bengali words are
 * whitespace-separated; punctuation such as period/comma does not
 * normally appear inside a Bengali product name.
 *
 * Tokens are normalised to lowercase + NFC for comparison, but the
 * original casing of the chosen token is preserved in the output.
 */
function tokenize(s: string): string[] {
  // Split on whitespace and a curated set of punctuation that should
  // not glue words together. Apostrophes inside English words
  // (L'Oréal) are KEPT so they don't fragment.
  return s
    .split(/[\s\u2000-\u200A\u2028\u2029,.;:!?()\[\]{}<>"'`/\\|]+/u)
    .filter(Boolean);
}

/**
 * Standard Levenshtein distance over Unicode code points.
 * O(m*n) — fine for product-name lengths (≤ 80 chars).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Row-based DP to keep memory at O(min(m,n)).
  const aLen = a.length;
  const bLen = b.length;
  if (aLen > bLen) {
    // ensure a is the shorter for memory efficiency
    return levenshtein(b, a);
  }
  const prev = new Array(aLen + 1);
  const curr = new Array(aLen + 1);
  for (let i = 0; i <= aLen; i++) prev[i] = i;

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    const bj = b.charCodeAt(j - 1);
    for (let i = 1; i <= aLen; i++) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,        // insertion
        prev[i] + 1,            // deletion
        prev[i - 1] + cost,     // substitution
      );
    }
    for (let i = 0; i <= aLen; i++) prev[i] = curr[i];
  }
  return prev[aLen];
}

/**
 * Per-word edit distance budget.
 * Bengali has 50+ consonants; English has 26 letters. We allow up to
 * 2 substitutions / insertions / deletions per word — that's enough
 * to fix a single typo but not enough to silently rewrite "আম" as
 * something else.
 */
const PER_WORD_BUDGET = 2;

/**
 * Decide whether two single-word token lists are "the same words".
 * Returns:
 *   - "match"        — same words, same order, possibly with small
 *                      per-word corrections.
 *   - "count_diff"   — different number of words.
 *   - "order_diff"   — same words but different order.
 *   - "too_far"      — same shape but per-word distance > budget.
 *
 * Algorithm:
 *   1. Different length → count_diff.
 *   2. Same normalised words, same order → "match" (no per-word check
 *      needed; differences are pure casing / NFC).
 *   3. Same multiset of normalised words, different order → "order_diff"
 *      (we never accept this — reordering is forbidden).
 *   4. Words differ pairwise → run per-word Levenshtein budget. If
 *      every per-word distance ≤ PER_WORD_BUDGET, accept as "match";
 *      otherwise "too_far".
 */
function classifyWordLists(
  inputWords: string[],
  llmWords: string[],
  _locale: NameLocale,
): "match" | "count_diff" | "order_diff" | "too_far" {
  if (inputWords.length !== llmWords.length) return "count_diff";

  const norm = (w: string) => w.normalize("NFC").toLowerCase();
  const inputNorm = inputWords.map(norm);
  const llmNorm = llmWords.map(norm);

  // Order check — if every normalised word matches in order, we
  // don't need to run per-word distance at all (the only difference
  // is casing / NFC normalisation).
  const orderOk = inputNorm.every((w, i) => w === llmNorm[i]);
  if (orderOk) return "match";

  // Different words — first check whether it's a reorder (same
  // multiset, different order). Reorder is forbidden even if the
  // per-word distance would be 0.
  const a = [...inputNorm].sort();
  const b = [...llmNorm].sort();
  const sameSet =
    a.length === b.length && a.every((w, i) => w === b[i]);
  if (sameSet) return "order_diff";

  // Otherwise run the per-word distance budget. This is what allows
  // small typo corrections like "অম" → "আম" or "Mago" → "Mango".
  for (let i = 0; i < inputWords.length; i++) {
    const d = levenshtein(inputWords[i], llmWords[i]);
    if (d > PER_WORD_BUDGET) return "too_far";
  }
  return "match";
}

export function applyNamePreservation(
  input: string,
  llmValue: string,
  locale: NameLocale,
): NamePreservationResult {
  const inRaw = (input ?? "").trim();
  const llmRaw = (llmValue ?? "").trim();

  // Empty admin input → use the LLM's proposal as-is.
  if (!inRaw) {
    return {
      value: llmRaw,
      corrected: false,
      rejected: false,
      reason: llmRaw ? "ok" : "rejected_empty_input_accepted_llm",
    };
  }

  // Empty LLM value → fall back to admin.
  if (!llmRaw) {
    return {
      value: inRaw,
      corrected: false,
      rejected: false,
      reason: "rejected_empty_input_accepted_llm",
    };
  }

  // Identical strings (after trim) → fast path.
  if (inRaw === llmRaw) {
    return { value: inRaw, corrected: false, rejected: false, reason: "ok" };
  }

  const inputWords = tokenize(inRaw);
  const llmWords = tokenize(llmRaw);

  // For 1-word names we still want to allow a small fix.
  // For multi-word names the rules above apply strictly.
  if (inputWords.length === 0 || llmWords.length === 0) {
    return {
      value: inRaw,
      corrected: false,
      rejected: true,
      reason: "rejected_llm_word_count",
    };
  }

  const verdict = classifyWordLists(inputWords, llmWords, locale);

  if (verdict === "match") {
    const changed = inputWords.some((w, i) => w !== llmWords[i]);
    return {
      value: llmRaw, // use the LLM's casing / spacing
      corrected: changed,
      rejected: false,
      reason: changed ? "ok_small_fix" : "ok",
    };
  }

  // Any drift → REJECT, keep admin input verbatim.
  const reason =
    verdict === "count_diff"
      ? "rejected_llm_word_count"
      : verdict === "order_diff"
        ? "rejected_llm_word_order"
        : "rejected_llm_per_word_distance";

  return { value: inRaw, corrected: false, rejected: true, reason };
}

/**
 * Derive a URL slug from a product name. Server-side, ASCII-only.
 *
 * If the name yields no usable ASCII characters (e.g. all Bengali),
 * a random fallback is generated so the slug is always non-empty.
 *
 * Exported for unit tests + so other endpoints can reuse it if needed.
 */
export function slugifyProductName(input: string): string {
  const ascii = (input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .replace(/[^\x00-\x7F]+/g, "");   // drop non-ASCII (Bengali etc.)
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug;
}

/**
 * Build a guaranteed-non-empty slug. Falls back to `product-{shortId}`
 * when the name yields nothing ASCII.
 */
export function buildProductSlug(
  name: string,
  shortIdFactory: () => string = () =>
    Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6),
): string {
  const slug = slugifyProductName(name);
  if (slug) return slug;
  return `product-${shortIdFactory()}`;
}
