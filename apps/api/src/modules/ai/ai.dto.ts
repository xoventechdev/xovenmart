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
    LlmVendor.KIEAI,
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

  /** OpenRouter attribution header value; ignored by other vendors
   *  (OpenAI, Anthropic, Gemini, kie.ai). */
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
   * Full category tree from the catalog so the LLM can pick one.
   * Each entry: { id, nameBn, nameEn, children?: same shape }.
   * Used by the server to resolve the LLM's `categoryName` choice
   * back to a `categoryId`. If omitted, the LLM gets no category list
   * and the response's `categoryId` is null.
   */
  @IsOptional()
  categories?: CategoryOption[];

  /**
   * Whitelist of units the LLM may propose (e.g. ["kg","pcs","L","pack"]).
   * The server REJECTS any `unit` value the LLM returns that is not in
   * this list. If omitted, the LLM is told to leave unit blank.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  unitOptions?: string[];

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

/**
 * Shape of a single category entry posted by the form so the LLM can
 * pick from the same list the admin sees in the dropdown. Server
 * resolves `nameBn` / `nameEn` back to the id.
 */
export interface CategoryOption {
  id: string;
  nameBn: string;
  nameEn: string;
  children?: CategoryOption[];
}
