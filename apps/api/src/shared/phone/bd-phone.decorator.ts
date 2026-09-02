import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import {
  BD_PHONE_REGEX,
  normalizeBDPhone,
} from "./bd-phone";

/**
 * `class-validator` constraint that mirrors the old inline
 * `@Matches(/^(?:\+?88)?01[3-9]\d{8}$/)` but normalizes the value
 * before writing it back to the DTO instance via `class-transformer`'s
 * `@Transform`. Wire both decorators together on the field:
 *
 *   `@Transform(({ value }) => normalizeBDPhone(value))`
 *   `@IsBDPhone()`
 *   phone!: string;
 *
 * The flow is:
 *   1. `class-transformer` `Transform` strips `+88`/`88` + whitespace.
 *   2. `class-validator` validates against the canonical regex.
 *   3. Controller / service can rely on `01XXXXXXXXX` form.
 *
 * Callers that just want the validation without the transform
 * (e.g. for read DTOs) can skip the `@Transform`.
 */
@ValidatorConstraint({ name: "IsBDPhone", async: false })
class IsBDPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string") return false;
    if (!value) return true; // let `@IsOptional()` decide emptiness
    return BD_PHONE_REGEX.test(value.trim());
  }
  defaultMessage(): string {
    return "Invalid Bangladesh phone number (use 01XXXXXXXXX, optionally with +88 prefix)";
  }
}

/** Decorator for any string field that must be a valid BD phone. */
export function IsBDPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsBDPhoneConstraint,
    });
  };
}

// Re-export the raw helpers so callers can import everything from one
// place: `import { IsBDPhone, normalizeBDPhone, toE164BD } from
// "../../shared/phone";`
export { BD_PHONE_REGEX, normalizeBDPhone, toE164BD } from "./bd-phone";