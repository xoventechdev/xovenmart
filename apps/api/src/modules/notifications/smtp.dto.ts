import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { EmailPurpose, SmtpEncryption } from "@prisma/client";

/**
 * Body for `POST /admin/system/smtp/providers` — create a new SMTP provider.
 * The password is the only field the API will encrypt (AES-256-GCM) before
 * persisting; the rest are plaintext.
 */
export class CreateSmtpProviderDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @MaxLength(255)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @MaxLength(255)
  user!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  pass!: string;

  @IsEmail()
  @MaxLength(255)
  fromAddress!: string;

  @IsString()
  @MaxLength(120)
  fromName!: string;

  @IsIn(["NONE", "STARTTLS", "TLS"])
  encryption!: SmtpEncryption;

  @IsOptional()
  @IsBoolean()
  rejectUnauthorized?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Body for `PATCH /admin/system/smtp/providers/:id`. All fields optional —
 * only what is sent is updated. `pass` is re-encrypted if provided; otherwise
 * the existing ciphertext is preserved untouched.
 */
export class UpdateSmtpProviderDto {
  @IsOptional() @IsString() @MaxLength(80)  label?: string;
  @IsOptional() @IsString() @MaxLength(255) host?: string;
  @IsOptional() @IsInt()    @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsString() @MaxLength(255) user?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) pass?: string;
  @IsOptional() @IsEmail()  @MaxLength(255) fromAddress?: string;
  @IsOptional() @IsString() @MaxLength(120) fromName?: string;
  @IsOptional() @IsIn(["NONE", "STARTTLS", "TLS"]) encryption?: SmtpEncryption;
  @IsOptional() @IsBoolean() rejectUnauthorized?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Body for `POST /admin/system/smtp/providers/:id/test`.
 * Recipient + optional subject/body override — the default subject/body
 * is a friendly "XovenMart SMTP test" message.
 */
export class TestSmtpDto {
  @IsEmail()
  @MaxLength(255)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}

/**
 * Body for `PATCH /admin/system/smtp/default`.
 */
export class SetDefaultProviderDto {
  @IsString()
  providerId!: string;
}

/**
 * Body for `PATCH /admin/system/smtp/purposes`.
 * Pass `providerId: null` to clear the assignment for a purpose — the
 * system will fall back to the default provider (then to env vars).
 */
export class AssignPurposeDto {
  @IsIn(["AUTH", "ORDERS", "BACKUPS", "MARKETING"])
  purpose!: EmailPurpose;

  @IsOptional()
  @IsString()
  providerId?: string | null;
}
