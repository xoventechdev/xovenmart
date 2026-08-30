/**
 * Shared form validation utilities.
 */

/** Bangladesh mobile — 01[3-9]XXXXXXXX, optional +88 prefix. */
export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;

export const PHONE_ERROR_BN = "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)";
export const PHONE_ERROR_EN = "Enter a valid Bangladesh mobile number (01XXXXXXXXX)";

/**
 * Strip the optional +88 prefix from a Bangladesh phone so we always
 * store / send "01XXXXXXXXX" to the API.
 */
export function normalizeBDPhone(phone: string): string {
  return phone.replace(/^\+?88/, "").trim();
}

/**
 * Lightweight email regex (good enough for client-side hints).
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
