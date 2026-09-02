/**
 * Bangladesh phone-number helpers — single source of truth for the backend.
 *
 * The business operates only inside Bangladesh, so we accept and store
 * phone numbers in the **local 11-digit form** (`01XXXXXXXXX`). Any
 * country-code prefix (`+88` or `88`) is stripped at every entry point
 * (DTO validation, controller, service) so a customer who types
 * `+8801712345678`, `8801712345678`, or `01712345678` is always matched
 * against the same canonical DB row.
 *
 * Rules:
 *   • Valid forms accepted: `01XXXXXXXXX`, `+8801XXXXXXXXX`,
 *     `8801XXXXXXXXX` (where X is a digit, second digit of the prefix
 *     must be 3-9).
 *   • Canonical form stored in DB: `01XXXXXXXXX` (no country code).
 *   • SMS gateway numbers are converted to E.164 (`+880XXXXXXXXXX`) at
 *     the SMS dispatch layer — see `shared/sms/sms.service.ts`.
 *
 * If a future country is added, swap the constants for a per-country
 * resolver. For now: Bangladesh-only.
 */

/**
 * Canonical regex — accepts the optional `+88` / `88` prefix so legacy
 * clients that paste a number with a country code still validate, but
 * the canonical stored form is always the 11-digit local number.
 */
export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;

/**
 * Strict canonical regex — accepts ONLY the 11-digit local form.
 * Use this on DTOs that should reject any country-code input (e.g. the
 * public track endpoint, the public general-settings `store.phone`).
 */
export const BD_PHONE_LOCAL_REGEX = /^01[3-9]\d{8}$/;

/**
 * Convert any accepted form (`01XXXXXXXXX`, `+8801XXXXXXXXX`,
 * `8801XXXXXXXXX`) to the canonical 11-digit local form.
 *
 * - Trims whitespace
 * - Strips a single optional `+88` or `88` prefix
 * - Returns the input unchanged if it does not match `BD_PHONE_REGEX`
 *
 * NOTE: this is intentionally permissive — if the caller passes garbage
 * we return it as-is so the upstream `@Matches(BD_PHONE_LOCAL_REGEX)`
 * validator can reject it with the standard validation error. Never use
 * the return value of this function without validating it first.
 */
export function normalizeBDPhone(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).trim().replace(/^\+?88/, "").trim();
}

/**
 * Validate that a string is a canonical BD phone (no country code).
 * Use this on every DTO + DB-write boundary so the DB only ever sees
 * the canonical 11-digit form.
 */
export function isCanonicalBDPhone(input: string | null | undefined): boolean {
  if (!input) return false;
  return BD_PHONE_LOCAL_REGEX.test(String(input).trim());
}

/**
 * Convert a canonical BD phone to E.164 for the SMS gateway
 * (`+880XXXXXXXXXX`). Returns empty string on invalid input.
 */
export function toE164BD(input: string | null | undefined): string {
  const canonical = normalizeBDPhone(input);
  if (!isCanonicalBDPhone(canonical)) return "";
  return `+88${canonical}`;
}