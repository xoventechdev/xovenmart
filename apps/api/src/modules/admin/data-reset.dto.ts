import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

/**
 * Body for `POST /admin/system/data-reset`.
 *
 * The confirmation phrase is intentionally literal + case-sensitive
 * (no normalization, no trim) — accidental lowercase / typo variants
 * must NOT trigger a destructive operation. The phrase
 * `"WIPE DEMO DATA"` is the only accepted value; any other input is
 * rejected by the validation pipe with a 400.
 *
 * `notes` is purely for the audit log; it doesn't change what gets
 * wiped.
 */
export class DataResetDto {
  @IsOptional()
  @IsString()
  @Matches(/^WIPE DEMO DATA$/, {
    message: 'Confirmation phrase must be exactly "WIPE DEMO DATA" (case-sensitive)',
  })
  confirm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
