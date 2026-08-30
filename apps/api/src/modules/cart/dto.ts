import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CartItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  qty!: number;
}

export class AddToCartDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}

export class UpdateCartItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  qty!: number;
}

export class MergeCartDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  items!: CartItemDto[];
}

export class PriceCartDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiPropertyOptional({ description: "Coupon / promo code (uppercase)" })
  @IsOptional()
  @IsString()
  couponCode?: string;
}