import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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
 * Mirrors the existing `Address` Prisma model fields. lat/lng are
 * optional so users can save a hand-typed address without a map pin.
 */
export class CreateAddressDto {
  @ApiProperty({ required: false, example: "Home", description: "Short label: Home / Office / Other" })
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

  @ApiProperty({ required: false, example: 23.461, minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiProperty({ required: false, example: 91.182, minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiProperty({ required: false, example: true, description: "Mark this address as the user's default. First address auto-becomes default." })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * PATCH /customers/me/addresses/:id
 *
 * Partial update. The same `isDefault` semantics as create (transactional
 * flip from the old default to the new one).
 */
export class UpdateAddressDto {
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
