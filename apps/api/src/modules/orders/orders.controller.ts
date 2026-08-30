import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { OrderStatus } from "@prisma/client";
import { OrdersService } from "./orders.service";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ─── Customer endpoints ────────────────────────────────────────

  @Get("mine")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("CUSTOMER")
  @Audience("customer" as any)
  @ApiBearerAuth("Customer")
  @ApiOperation({ summary: "List my orders (customer only)" })
  mine(@Req() req: Request) {
    return this.orders.getMyOrders(req);
  }

  @Get("track/:orderNo")
  @ApiOperation({
    summary:
      "Track an order by order number. PUBLIC endpoint (no auth required). If `phone` is passed and matches the order contact, full details are returned; if missing or wrong, only safe public fields are returned (no name, masked phone, no landmark/lat/lng). 404 if order doesn't exist (regardless of phone correctness, to avoid existence leaks).",
  })
  track(@Param("orderNo") orderNo: string, @Query("phone") phone?: string) {
    return this.orders.trackByOrderNo(orderNo, phone);
  }

  @Get("mine/:id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("CUSTOMER")
  @Audience("customer" as any)
  @ApiBearerAuth("Customer")
  myOrder(@Req() req: Request, @Param("id") id: string) {
    return this.orders.getMyOrderById(req, id);
  }

  // ─── Admin / Rider status update ───────────────────────────────

  @Patch(":id/status")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("ADMIN", "RIDER")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Update order status. ADMIN: any status. RIDER: only OUT_FOR_DELIVERY or DELIVERED (for own deliveries).",
  })
  updateStatus(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { status: OrderStatus; note?: string },
  ) {
    return this.orders.updateStatus(req, id, body.status, body.note);
  }
}