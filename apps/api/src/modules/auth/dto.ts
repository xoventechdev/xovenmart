import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";
import { IsBDPhone, normalizeBDPhone } from "../../shared/phone";

// All phone DTOs share the same transform + validation chain:
//   1. `@Transform` strips `+88`/`88` and whitespace.
//   2. `@IsBDPhone` validates the canonical form.
// The service layer can then trust that `phone` is `01XXXXXXXXX`.

export class RequestOtpDto {
  @ApiProperty({ example: "01720694513", description: "BD phone (11 digits, starts with 01). Optional +88 prefix allowed." })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: "01720694513" })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class CustomerLoginDto {
  @ApiProperty({ example: "01720694513", description: "BD phone (11 digits, starts with 01). Optional +88 prefix allowed." })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;

  @ApiProperty({ minLength: 6, maxLength: 72, example: "secret123" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: "01720694513" })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: "01720694513" })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(6, 6)
  otpCode!: string;

  @ApiProperty({ minLength: 6, maxLength: 72, example: "newpass456" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword!: string;
}

export class RegisterDto {
  @ApiProperty({ example: "01720694513" })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;

  @ApiProperty({ minLength: 2, example: "কামাল হোসেন" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ minLength: 6, maxLength: 72, example: "secret123", description: "Password for future login (min 6 chars)" })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ required: false, example: "kamal@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  /** 6-digit OTP already verified via /customer/verify-otp temp token, OR provide it here */
  @ApiProperty({ required: false, example: "123456" })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  otpCode?: string;

  /** Referral code (uppercase 8 chars). If present, this user is referred. */
  @ApiProperty({ required: false, example: "XVM4K7P2", description: "Referral code from a registered user" })
  @IsOptional()
  @IsString()
  @Length(8, 8)
  referralCode?: string;
}

export class AdminLoginDto {
  @ApiProperty({ example: "admin@xovenmart.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6, example: "admin123" })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RiderLoginDto {
  @ApiProperty({ example: "rider@xovenmart.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6, example: "rider123" })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

// ───────────────────────────────────────────────────────────────────
// New flexible registration / login DTOs
//
// Both flows work off an "identifier" that can be either a BD phone or
// an email. The service layer resolves which kind via a regex (email
// shape) and routes accordingly. Email format uses class-validator's
// built-in IsEmail when possible; phone goes through the existing
// IsBDPhone chain.
// ───────────────────────────────────────────────────────────────────

/**
 * Step 1 of the new 2-step registration. All four contact fields are
 * mandatory per the agreed UX (full name, mobile, email, password) —
 * email + mobile are unique. The optional referralCode is forwarded to
 * the service-layer referral resolver.
 */
export class RegisterStartDto {
  @ApiProperty({ minLength: 2, example: "কামাল হোসেন" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: "01720694513", description: "BD phone (11 digits, starts with 01)." })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;

  @ApiProperty({ example: "kamal@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6, maxLength: 72 })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ required: false, example: "XVM4K7P2" })
  @IsOptional()
  @IsString()
  @Length(8, 8)
  referralCode?: string;
}

/** Step 2 of registration. Identifies the user created in step 1. */
export class RegisterVerifyDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(4, 10)
  code!: string;
}

/**
 * Login start — accepts a free-text identifier (phone or email). The
 * service decides which kind it is. Password is REQUIRED: the OTP
 * step is always a second factor, never a substitute for the
 * password.
 */
export class LoginStartDto {
  @ApiProperty({
    description: "Either BD phone (01XXXXXXXXX) or email.",
    example: "01720694513 OR kamal@example.com",
  })
  @IsString()
  @MinLength(4)
  identifier!: string;

  @ApiProperty({
    minLength: 6,
    maxLength: 72,
    description: "Account password (required).",
  })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}

export class LoginVerifyDto {
  @ApiProperty({ description: "Same identifier the start call used." })
  @IsString()
  @MinLength(4)
  identifier!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(4, 10)
  code!: string;
}

export class ForgotByIdentifierDto {
  @ApiProperty({ description: "Email or BD phone." })
  @IsString()
  @MinLength(4)
  identifier!: string;
}

export class ResetByIdentifierDto {
  @ApiProperty({ description: "Email or BD phone." })
  @IsString()
  @MinLength(4)
  identifier!: string;

  @ApiProperty({ example: "123456" })
  @IsString()
  @Length(4, 10)
  otpCode!: string;

  @ApiProperty({ minLength: 6, maxLength: 72 })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword!: string;
}