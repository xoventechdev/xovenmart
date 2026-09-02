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

/**
 * Quick Order address — usually the cashier types a free-form area or picks a
 * stored address. POS orders skip delivery zones (they're picked up / delivered
 * by the cashier/admin, not the 30-min rider pool), so lat/lng are optional
 * but encouraged for the address snapshot.
 */
export class PosAddressDto {
  @ApiPropertyOptional({
    enum: AddressType,
    example: "HOME",
    description: "Address slot (HOME / OFFICE / OTHER). Defaults to OTHER.",
  })
  @IsOptional()
  @IsEnum(AddressType, { message: "type must be HOME, OFFICE, or OTHER" })
  type?: AddressType;

  @ApiPropertyOptional({ example: "Home" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: "Mudaforgonj" })
  @IsString()
  @MinLength(2)
  area!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiProperty({ example: "House 23, Moddhopara, Mudafarganj" })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  fullText!: string;

  @ApiPropertyOptional({ example: 23.7853, description: "Optional — used for snapshot only." })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 91.1153 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class PosOrderItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

/**
 * POS Quick Order request body.
 *
 * `customerPhone` is the lookup key — we either attach the order to an
 * existing User with that phone OR store it as a guest order if no user
 * exists. `customerName` is required for guest (non-registered) orders.
 *
 * `paymentMethod` accepts anything the schema supports:
 *   - CASH         → over-the-counter / handed to cashier (most common POS)
 *   - COD          → rider collects on delivery (same as web)
 *   - MANUAL_BKASH → customer sent bKash personally; admin marks as paid
 *   - BKASH / NAGAD / ROCKET / BANK → reserved for future payment integrations
 *
 * `source` is locked to "POS" at the service layer (controller accepts
 * no override).
 */
export class CreatePosOrderDto {
  // ─── Customer ───
  @ApiProperty({ description: "Customer phone — used to attach to existing user or save as guest.", example: "01712345678" })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  customerPhone!: string;

  @ApiPropertyOptional({ description: "Required if no existing user matches the phone." })
  @IsOptional()
  @IsString()
  @MinLength(2)
  customerName?: string;

  @ApiPropertyOptional({ description: "Snapshot email if the customer provided one." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerEmail?: string;

  // ─── Address ───
  @ApiProperty({ type: PosAddressDto })
  @ValidateNested()
  @Type(() => PosAddressDto)
  address!: PosAddressDto;

  // ─── Items ───
  @ApiProperty({ type: [PosOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosOrderItemDto)
  items!: PosOrderItemDto[];

  // ─── Payment ───
  @ApiProperty({
    enum: ["CASH", "COD", "MANUAL_BKASH", "BKASH", "NAGAD", "ROCKET", "BANK"],
    default: "CASH",
    description: "How the customer paid. POS defaults to CASH (over-the-counter).",
  })
  @IsIn(["CASH", "COD", "MANUAL_BKASH", "BKASH", "NAGAD", "ROCKET", "BANK"])
  paymentMethod!: "CASH" | "COD" | "MANUAL_BKASH" | "BKASH" | "NAGAD" | "ROCKET" | "BANK";

  // ─── Pricing (cashier-entered) ───
  // POS skips the server-side delivery-fee / coupon engine — the cashier
  // types the numbers they negotiated with the customer. We still validate
  // they sum correctly so we never store a wrong grandTotal.
  @ApiProperty({ description: "Sum of (qty * unitPrice) across all items.", example: 950 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;

  @ApiPropertyOptional({ example: 50, description: "Cashier-applied discount (flat BDT)." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountTotal?: number;

  @ApiPropertyOptional({ example: 60, description: "Cashier-applied delivery fee." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @ApiPropertyOptional({ description: "Free-form admin note attached to the order." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: "Optional initial status override. Defaults to ACCEPTED (cashier accepted the order on the customer's behalf).",
    enum: ["PENDING", "ACCEPTED", "PREPARING"],
    default: "ACCEPTED",
  })
  @IsOptional()
  @IsIn(["PENDING", "ACCEPTED", "PREPARING"])
  initialStatus?: "PENDING" | "ACCEPTED" | "PREPARING";

  @ApiPropertyOptional({
    description: "When CASH or MANUAL_BKASH, cashier may mark the payment as already PAID.",
    default: false,
  })
  @IsOptional()
  markAsPaid?: boolean;
}
