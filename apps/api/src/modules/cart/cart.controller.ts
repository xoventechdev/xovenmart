import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CartService } from "./cart.service";
import { PriceCartDto } from "./dto";

@ApiTags("cart")
@Controller("cart")
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Post("price")
  @ApiOperation({
    summary: "Compute cart totals (subtotal, discount, grand total). Apply optional coupon.",
  })
  price(@Body() dto: PriceCartDto) {
    return this.cart.price(dto.items ?? [], dto.couponCode ?? null);
  }
}