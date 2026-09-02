import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { AddressType } from "@prisma/client";
import { IsBDPhone, normalizeBDPhone } from "../../shared/phone";

export class AddressDto {
  /**
   * Address slot for this order's snapshot (HOME / OFFICE / OTHER).
   *
   * The full address book with slot enforcement lives in the customers
   * module — checkout just records what the user picked at the time of
   * order. We keep this purely informational so:
   *   - the Android app (out of scope for this redesign) keeps working
   *     by reading `label`.
   *   - admin-side reporting can group orders by delivery destination
   *     type without re-deriving from `fullText`.
   *   - the new web checkout can render the slot chip in the order
   *     success / track pages.
   *
   * If omitted, the service defaults to "HOME" (legacy behaviour).
   */
  @ApiPropertyOptional({
    enum: AddressType,
    example: "HOME",
    description: "Address slot (HOME / OFFICE / OTHER). Optional — defaults to HOME.",
  })
  @IsOptional()
  @IsEnum(AddressType, { message: "type must be HOME, OFFICE, or OTHER" })
  type?: AddressType;

  @ApiPropertyOptional({ example: "Home", description: "Address label (legacy / back-compat)" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: "Mudaforgonj", description: "Area name" })
  @IsString()
  @MinLength(2)
  area!: string;

  @ApiPropertyOptional({ description: "Landmark (optional)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiProperty({ description: "Full address as one line", example: "বাড়ি ২৩, মধ্যপাড়া, মুড়াফরগঞ্জ" })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  fullText!: string;

  @ApiProperty({ example: 23.7853 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 91.1153 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class CheckoutItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class CheckoutDto {
  // ─── Customer (optional — guest checkout supported) ───
  @ApiPropertyOptional({ description: "Required only if customer is NOT logged in (guest checkout). 11 digits, optionally with +88 prefix." })
  @IsOptional()
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  guestPhone?: string;

  @ApiPropertyOptional({ description: "Required only for guest checkout" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  guestName?: string;

  // ─── Address ───
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  // ─── Items ───
  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  // ─── Promo ───
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;

  // ─── Payment (Day 1: only COD supported) ───
  @ApiProperty({ enum: ["COD"], default: "COD" })
  @IsIn(["COD"])
  paymentMethod!: "COD";

  // ─── Notes ───
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // ─── Source (defaults to WEB) ───
  // Web customers send "WEB"; the Android customer app sends "ANDROID".
  // The admin POS screen sends "POS" via a separate endpoint, so it never
  // reaches this DTO. We accept it here purely as future-proofing — the
  // schema has the column, the service writes whatever the client sends.
  @ApiPropertyOptional({
    enum: ["WEB", "ANDROID"],
    default: "WEB",
    description: "Channel the order came in on. Defaults to WEB.",
  })
  @IsOptional()
  @IsIn(["WEB", "ANDROID"])
  source?: "WEB" | "ANDROID";
}