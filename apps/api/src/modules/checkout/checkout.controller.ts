import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { CheckoutService } from "./checkout.service";
import { CheckoutDto } from "./dto";

@ApiTags("checkout")
@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @ApiBearerAuth() // optional — guest checkout also works without
  @ApiOperation({
    summary: "Place an order (guest or registered). Day 1: only COD supported.",
  })
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  place(@Body() dto: CheckoutDto, @Req() req: Request) {
    return this.checkout.place(dto, req);
  }
}