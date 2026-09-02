/**
 * Barrel for Bangladesh phone helpers + class-validator decorator.
 *
 * Services / DTOs should import from `../../shared/phone` (this file) so
 * the helper set can grow (more regexes, formatters, validators) without
 * touching every call site.
 */
export {
  BD_PHONE_REGEX,
  BD_PHONE_LOCAL_REGEX,
  normalizeBDPhone,
  isCanonicalBDPhone,
  toE164BD,
} from "./bd-phone";
export { IsBDPhone } from "./bd-phone.decorator";
