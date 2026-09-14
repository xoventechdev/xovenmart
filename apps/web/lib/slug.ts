/**
 * Lowercase + strip non-word/space/hyphen + replace whitespace with `-`.
 * Caps at 80 chars to keep URLs sane.
 *
 * Mirrors the server-side `apps/api/src/shared/slug.ts` exactly so
 * the value the admin sees in the slug field matches what the server
 * will compute if the admin leaves the field blank.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
