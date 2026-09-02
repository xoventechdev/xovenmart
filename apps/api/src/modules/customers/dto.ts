import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { AddressType } from "@prisma/client";

/**
 * Re-export so consumers don't have to import from @prisma/client just to
 * talk about address slots. The string values ("HOME" | "OFFICE" | "OTHER")
 * stay stable even if the Prisma enum name changes.
 */
export { AddressType };

/**
 * PATCH /customers/me
 *
 * Customers can change their name (required) and email (optional).
 * Phone is intentionally NOT editable here — it's the login identifier,
 * and changing it would require a separate OTP-verified flow.
 */
export class UpdateProfileDto {
  @ApiProperty({ minLength: 2, maxLength: 80, example: "কামাল হোসেন" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ required: false, example: "kamal@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;
}

/**
 * POST /customers/me/addresses
 *
 * Mirrors the existing `Address` Prisma model fields. lat/lng are REQUIRED
 * — every saved address (Home / Office / Other) must have a map pin so
 * the delivery fee + zone routing can be computed later without forcing
 * the user to pick again at checkout. The frontend modal blocks submit
 * until both values are set, and the checkout page uses the saved
 * coordinates directly when the user picks a saved address for delivery
 * (no re-pick on the map needed).
 *
 * Slot semantics:
 *   - A customer has at most ONE address per type (HOME / OFFICE / OTHER).
 *   - Creating a duplicate slot returns 409 ConflictException.
 *   - `label` is still accepted (legacy free-text), but new writes should
 *     pass `type`. The backend derives `label` from `type` so the
 *     address has a consistent display value.
 */
export class CreateAddressDto {
  @ApiProperty({
    required: false,
    enum: AddressType,
    example: "HOME",
    description: "Address slot. Defaults to OTHER. A user can have at most one of each.",
  })
  @IsOptional()
  @IsEnum(AddressType, { message: "type must be HOME, OFFICE, or OTHER" })
  type?: AddressType;

  @ApiProperty({
    required: false,
    example: "Home",
    description:
      "Free-text label (legacy / back-compat). New writes should use `type` instead. " +
      "If omitted, the backend derives it from `type`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiProperty({ minLength: 1, maxLength: 120, example: "Mudafarganj" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  area!: string;

  @ApiProperty({ required: false, example: "Near bazaar" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiProperty({ minLength: 5, maxLength: 500, example: "Mudafarganj bazaar, near the mosque" })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  fullText!: string;

  @ApiProperty({ example: 23.461, minimum: -90, maximum: 90, description: "REQUIRED — must pick a map pin before saving." })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 91.182, minimum: -180, maximum: 180, description: "REQUIRED — must pick a map pin before saving." })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ required: false, example: true, description: "Mark this address as the user's default. First address auto-becomes default." })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * PATCH /customers/me/addresses/:id
 *
 * Partial update. The same `isDefault` semantics as create (transactional
 * flip from the old default to the new one). Changing `type` is allowed
 * only if no OTHER row already occupies the target slot — returns 409
 * ConflictException otherwise.
 */
export class UpdateAddressDto {
  @ApiProperty({ required: false, enum: AddressType })
  @IsOptional()
  @IsEnum(AddressType, { message: "type must be HOME, OFFICE, or OTHER" })
  type?: AddressType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  area?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  fullText?: string;

  @ApiProperty({ example: 23.461, minimum: -90, maximum: 90, description: "REQUIRED — every saved address must have a map pin." })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 91.182, minimum: -180, maximum: 180, description: "REQUIRED — every saved address must have a map pin." })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
