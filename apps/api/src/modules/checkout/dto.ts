import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const BDPhoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;

export class AddressDto {
  @ApiPropertyOptional({ example: "Home", description: "Address label" })
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
  @ApiPropertyOptional({ description: "Required only if customer is NOT logged in (guest checkout)" })
  @IsOptional()
  @Matches(BDPhoneRegex, { message: "Invalid Bangladesh phone" })
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