/**
 * Helpers for picking the right bilingual DB column based on the live
 * language preference. Used in client components to render `Product.nameBn`
 * vs `Product.nameEn` (and the same for descriptions, categories, coupons,
 * site pages, etc.).
 *
 * Always prefer EN when present — if a row has only `nameBn` we fall back
 * to it so we never show blank text.
 */
export type WithBilingualName = {
  nameBn?: string | null;
  nameEn?: string | null;
};
export type WithBilingualTitle = {
  titleBn?: string | null;
  titleEn?: string | null;
};
export type WithBilingualDescription = {
  descriptionBn?: string | null;
  descriptionEn?: string | null;
};

/** Combined type: anything that has bilingual name OR title columns. */
export type WithAnyBilingualName =
  | (WithBilingualName & Partial<WithBilingualTitle>)
  | (WithBilingualTitle & Partial<WithBilingualName>)
  | (WithBilingualName & WithBilingualTitle)
  | null
  | undefined;

export function pickName(item: WithAnyBilingualName, lang: "bn" | "en"): string {
  if (!item) return "";
  const anyItem = item as any;
  const enPrimary =
    (typeof anyItem.nameEn === "string" && anyItem.nameEn.trim()) ||
    (typeof anyItem.titleEn === "string" && anyItem.titleEn.trim()) ||
    "";
  const bnPrimary =
    (typeof anyItem.nameBn === "string" && anyItem.nameBn.trim()) ||
    (typeof anyItem.titleBn === "string" && anyItem.titleBn.trim()) ||
    "";
  const enFallback =
    (typeof anyItem.nameBn === "string" && anyItem.nameBn) ||
    (typeof anyItem.titleBn === "string" && anyItem.titleBn) ||
    "";
  const bnFallback =
    (typeof anyItem.nameEn === "string" && anyItem.nameEn) ||
    (typeof anyItem.titleEn === "string" && anyItem.titleEn) ||
    "";
  if (lang === "en") return enPrimary || bnFallback || "";
  return bnPrimary || enFallback || "";
}

export function pickDescription(
  item: WithBilingualDescription | null | undefined,
  lang: "bn" | "en",
): string {
  if (!item) return "";
  if (lang === "en") {
    return (item.descriptionEn && item.descriptionEn.trim()) || (item.descriptionBn ?? "") || "";
  }
  return (item.descriptionBn && item.descriptionBn.trim()) || (item.descriptionEn ?? "") || "";
}

/**
 * Generic field-pair picker for non-standard column names (e.g. `bn`/`en`,
 * `titleBn`/`titleEn`, `addressBn`/`addressEn`). Pass the two field names
 * and an object; we'll read the right one.
 */
export function pickField<T extends Record<string, any>>(
  item: T | null | undefined,
  bnField: keyof T,
  enField: keyof T,
  lang: "bn" | "en",
): string {
  if (!item) return "";
  const primary = lang === "en" ? item[enField] : item[bnField];
  const fallback = lang === "en" ? item[bnField] : item[enField];
  const v = (primary ?? "") as string;
  if (v && String(v).trim().length > 0) return String(v);
  return ((fallback ?? "") as string) || "";
}
