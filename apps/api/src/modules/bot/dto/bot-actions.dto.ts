import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type, Transform } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { IsBDPhone, normalizeBDPhone } from "../../../shared/phone";

/**
 * Bot channels. Mirrors the new `OrderSource` enum values added to
 * Prisma so bot-placed orders show up correctly in admin reporting
 * (`source = MESSENGER` rather than being mis-labelled as WEB).
 */
export enum BotChannel {
  MESSENGER = "MESSENGER",
  WHATSAPP_CLOUD = "WHATSAPP_CLOUD",
  WHATSAPP_GREEN = "WHATSAPP_GREEN",
}

/**
 * Compact product shape returned by the bot-facing catalog endpoints.
 * The regular `/catalog/...` endpoints return the full product
 * (with `descriptionBn/En`, `images[]`, `variants[]` of objects etc.)
 * — too big for a chat reply. The bot wrappers strip down to the
 * fields a chat reply needs.
 */
export class BotProductCard {
  @ApiProperty() slug!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ description: "Sale price in BDT, numeric" })
  salePrice!: number;
  @ApiProperty({ description: "MRP in BDT, numeric. 0 when no MRP set." })
  mrp!: number;
  @ApiProperty() inStock!: boolean;
  @ApiPropertyOptional({ description: "When set, customer is outside all delivery zones" })
  outsideAllZones?: boolean;
}

/**
 * `/bot/catalog/product/:slug` returns this slightly richer shape so
 * the bot can answer "what variants / sizes are there?" and the
 * customer can pick one without leaving the chat.
 */
export class BotVariantCard {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() priceSale!: number;
  @ApiProperty() inStock!: boolean;
}

export class BotProductDetail {
  @ApiProperty() slug!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() salePrice!: number;
  @ApiProperty() mrp!: number;
  @ApiProperty() inStock!: boolean;
  @ApiPropertyOptional({ type: [BotVariantCard] })
  variants?: BotVariantCard[];
  @ApiPropertyOptional() unit?: string;
}

/**
 * `/bot/orders/place` accepts the bot's conversational cart.
 *
 * Notes for the n8n workflow author:
 *  - `idempotencyKey` is REQUIRED — the server rejects requests without
 *    it. Each conversation turn that triggers `place_order` MUST
 *    generate a fresh UUID and pass it back. Without idempotency, a
 *    Green API retry will double-place the order.
 *  - `phone` is normalised server-side (strip `+88`/`88`, must match
 *    the canonical 11-digit BD format) just like the public checkout
 *    endpoint.
 *  - `address.fullText` is the only mandatory address field — chat
 *    customers rarely know their precise lat/lng, so the n8n flow can
 *    geocode the `fullText` via OpenStreetMap Nominatim before calling
 *    this endpoint. If lat/lng are missing, the order still places but
 *    the delivery-fee calculation falls back to the highest base fee
 *    across all zones.
 */
export class BotPlaceOrderAddressDto {
  @ApiProperty({ minLength: 5, maxLength: 500, example: "বাড়ি ২৩, মধ্যপাড়া, মুড়াফরগঞ্জ" })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  fullText!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

  @ApiProperty({ example: 23.7853 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 91.1153 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class BotPlaceOrderItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ description: "Variant id when the product has variants" })
  @IsOptional()
  @IsString()
  variantId?: string;
}

export class BotPlaceOrderDto {
  @ApiProperty({ description: "Bangladesh phone (10-13 digits, with or without +88). Normalised server-side." })
  @Transform(({ value }) => normalizeBDPhone(value))
  @IsBDPhone()
  phone!: string;

  @ApiPropertyOptional({ description: "Optional display name; falls back to 'Messenger Customer' or similar." })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiProperty({ type: BotPlaceOrderAddressDto })
  @ValidateNested()
  @Type(() => BotPlaceOrderAddressDto)
  address!: BotPlaceOrderAddressDto;

  @ApiProperty({ type: [BotPlaceOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BotPlaceOrderItemDto)
  items!: BotPlaceOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @ApiPropertyOptional({ description: "Free-text note (e.g. 'ring the bell twice')" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /**
   * REQUIRED. UUID (or any globally-unique string <=80 chars). The
   * server returns the same orderNo for repeat calls within 24h.
   * n8n workflow should mint this with `={{$json["$execution.id"]}}` or
   * a `Crypto.randomUUID()` expression.
   */
  @ApiProperty({ minLength: 8, maxLength: 80 })
  @IsString()
  @Matches(/^[A-Za-z0-9_\-:.]+$/, {
    message: "idempotencyKey must be alphanumeric (plus _ - : .)",
  })
  idempotencyKey!: string;

  @ApiProperty({ enum: BotChannel })
  @IsEnum(BotChannel)
  channel!: BotChannel;

  @ApiProperty({
    description:
      "Provider-side sender id (PSID for Messenger, phone for WhatsApp). " +
      "Recorded on the Order so support tickets can join the conversation back to the order.",
  })
  @IsString()
  @MaxLength(80)
  senderId!: string;

  @ApiPropertyOptional({
    description:
      "Optional stable id grouping all orders from the same chat session. " +
      "Used for analytics and 'view all orders from this conversation' in admin.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  conversationId?: string;
}
