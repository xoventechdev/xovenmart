import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("rider")
@Controller("rider")
@UseGuards(AuthGuard, RolesGuard)
@Roles("RIDER")
@Audience("rider" as any)
@ApiBearerAuth("Rider")
export class RiderController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  @ApiOperation({ summary: "My rider profile" })
  async me(@Req() req: Request) {
    const riderId = (req as any).userId;
    return this.prisma.rider.findUnique({
      where: { id: riderId },
      select: { id: true, name: true, email: true, phone: true, currentFloat: true },
    });
  }

  @Get("deliveries")
  @ApiOperation({ summary: "My deliveries (today's + pending)" })
  async myDeliveries(@Req() req: Request) {
    const riderId = (req as any).userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.delivery.findMany({
      where: {
        riderId,
        assignedAt: { gte: today },
      },
      orderBy: { assignedAt: "asc" },
      include: {
        order: {
          include: {
            items: true,
            user: { select: { name: true, phone: true } },
          },
        },
      },
    });
  }

  @Get("deliveries/:id")
  @ApiOperation({ summary: "Get delivery detail (for own deliveries)" })
  async getDelivery(@Req() req: Request, @Param("id") id: string) {
    const riderId = (req as any).userId;
    const d = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        order: { include: { items: true, user: { select: { name: true, phone: true } } } },
      },
    });
    if (!d || d.riderId !== riderId) {
      return { error: "Not found" };
    }
    return d;
  }

  @Post("deliveries/:id/pick")
  @ApiOperation({ summary: "Mark delivery as PICKED_UP (transitions order PREPARED → OUT_FOR_DELIVERY)" })
  async pickDelivery(@Req() req: Request, @Param("id") id: string) {
    const riderId = (req as any).userId;
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.riderId !== riderId) {
      return { error: "Not found" };
    }
    await this.prisma.delivery.update({
      where: { id },
      data: { pickedAt: new Date() },
    });
    await this.prisma.order.update({
      where: { id: delivery.orderId },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    await this.prisma.orderStatusEvent.create({
      data: {
        orderId: delivery.orderId,
        fromStatus: "PREPARED",
        toStatus: "OUT_FOR_DELIVERY",
        actorId: riderId,
        actorRole: "RIDER",
        note: "Picked up by rider",
      },
    });
    return { ok: true };
  }

  @Post("deliveries/:id/deliver")
  @ApiOperation({
    summary:
      "Mark delivery as DELIVERED with POD (photo + OTP) and cash collected. Triggers order DELIVERED + customer notification.",
  })
  async deliver(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { podPhotoUrl: string; podOtp: string; cashCollected: number },
  ) {
    const riderId = (req as any).userId;
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.riderId !== riderId) {
      return { error: "Not found" };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id },
        data: {
          podPhotoUrl: body.podPhotoUrl,
          podOtp: body.podOtp,
          proofStatus: "DELIVERED",
          deliveredAt: new Date(),
          cashCollected: body.cashCollected,
        },
      });
      await tx.order.update({
        where: { id: delivery.orderId },
        data: { status: "DELIVERED", deliveredAt: new Date(), paymentStatus: "VERIFIED" },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId: delivery.orderId,
          fromStatus: "OUT_FOR_DELIVERY",
          toStatus: "DELIVERED",
          actorId: riderId,
          actorRole: "RIDER",
          note: "Delivered with POD",
        },
      });
      await tx.payment.updateMany({
        where: { orderId: delivery.orderId, status: "PENDING" },
        data: { status: "VERIFIED", verifiedAt: new Date(), verifiedBy: riderId },
      });
      // Update rider's current float
      const rider = await tx.rider.findUnique({ where: { id: riderId } });
      if (rider) {
        await tx.rider.update({
          where: { id: riderId },
          data: { currentFloat: Number(rider.currentFloat) + Number(body.cashCollected) },
        });
      }
    });

    return { ok: true };
  }

  @Post("deliveries/:id/fail")
  @ApiOperation({ summary: "Mark delivery as failed (customer absent, refused, wrong address)" })
  async fail(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { reason: string },
  ) {
    const riderId = (req as any).userId;
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery || delivery.riderId !== riderId) {
      return { error: "Not found" };
    }
    await this.prisma.delivery.update({
      where: { id },
      data: { proofStatus: "FAILED", failureReason: body.reason },
    });
    await this.prisma.order.update({
      where: { id: delivery.orderId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledReason: `Rider failed: ${body.reason}` },
    });
    return { ok: true };
  }
}