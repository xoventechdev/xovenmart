import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { LlmVendor } from "@prisma/client";

/**
 * DTOs for every endpoint under `/admin/ai/*`.
 *
 * Conventions:
 *   - All DTOs use `class-validator` decorators; the global
 *     `ValidationPipe` in main.ts auto-enforces them.
 *   - We do NOT accept `apiKey` in any GET / LIST response — only on
 *     create + update. Same for `appTitle` — settable, not returned.
 *   - `monthlyUsdCap` is capped at 1000 to catch obvious typos; the
 *     service rejects 429-style spend overage before each call.
 */

export class CreateLlmProviderDto {
  @IsString() @MinLength(2) @MaxLength(64)
  label!: string;

  @IsIn([
    LlmVendor.OPENAI,
    LlmVendor.ANTHROPIC,
    LlmVendor.GEMINI,
    LlmVendor.OPENROUTER,
  ])
  provider!: LlmVendor;

  @IsString() @MinLength(2) @MaxLength(128)
  model!: string;

  /** Raw plaintext key — encrypted via SecretsService before storage. */
  @IsString() @MinLength(8) @MaxLength(512)
  apiKey!: string;

  @IsOptional() @IsNumber() @Min(0)
  monthlyUsdCap?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  /** OpenRouter attribution header value; ignored by other vendors. */
  @IsOptional() @IsString() @MaxLength(128)
  appTitle?: string;
}

export class UpdateLlmProviderDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(64)
  label?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(128)
  model?: string;

  /** If present, RE-ENCRYPTS the API key on this row. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(512)
  apiKey?: string;

  @IsOptional() @IsNumber() @Min(0)
  monthlyUsdCap?: number | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @IsOptional() @IsString() @MaxLength(128)
  appTitle?: string | null;
}

/**
 * Input for `/admin/ai/generate-product-copy` — the button on the
 * product form posts this shape. The whitelist of writable fields
 * lives in the controller so the form can pick which fields to refill.
 */
export class GenerateProductCopyDto {
  @IsOptional() @IsString() @MaxLength(80)
  nameEn?: string;

  @IsOptional() @IsString() @MaxLength(80)
  nameBn?: string;

  @IsOptional() @IsString() @MaxLength(600)
  descriptionEn?: string;

  @IsOptional() @IsString() @MaxLength(600)
  descriptionBn?: string;

  @IsOptional() @IsString() @MaxLength(80)
  categoryName?: string;

  @IsOptional() @IsString() @MaxLength(32)
  unit?: string;

  @IsOptional() @IsString() @MaxLength(80)
  brand?: string;

  /**
   * Which fields the admin wants to overwrite in the form. Always
   * honoured on the response; we ONLY mutate these on the client. If
   * omitted, defaults to all four fields.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(["nameEn", "nameBn", "descriptionEn", "descriptionBn"], { each: true })
  fields?: ("nameEn" | "nameBn" | "descriptionEn" | "descriptionBn")[];
}
