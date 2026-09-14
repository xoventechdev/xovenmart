/**
 * Lowercase + strip non-word/space/hyphen + replace whitespace with `-`.
 * Caps at 80 chars to keep URLs sane (matches the `Product.slug` UX we
 * picked when the column was first added). Returns "" for empty /
 * non-string input.
 *
 * Kept in `shared/` so both controllers (admin `products`,
 * admin `suppliers`) and any future caller (catalog migrations,
 * bulk-import) use the same transform — drift between API + web is
 * the easiest way to end up with slugs the catalog can't resolve.
 *
 * Server-side counterpart of `apps/web/lib/slug.ts`. The two should
 * stay byte-identical.
 */
export function slugify(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
