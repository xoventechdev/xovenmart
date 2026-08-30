import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("coupons")
@Controller("coupons")
export class CouponsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("active")
  @ApiOperation({ summary: "List currently active public coupons for display in app/web" })
  async activeCoupons() {
    const now = new Date();
    return this.prisma.discount.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        // Exclude user-specific and system-issued
        issuer: { in: ["ADMIN", "PROMO"] },
        restrictedUserId: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, type: true, value: true,
        minOrder: true, maxDiscount: true,
        descriptionBn: true, descriptionEn: true,
        bannerImageUrl: true, scope: true,
        firstOrderOnly: true,
        startsAt: true, endsAt: true,
      },
    });
  }

  @Get(":code")
  @ApiOperation({ summary: "Get coupon details by code (without exposing usage stats to public)" })
  async byCode(@Param("code") code: string) {
    const upper = code.toUpperCase();
    const c = await this.prisma.discount.findUnique({
      where: { code: upper },
      select: {
        id: true, code: true, type: true, value: true,
        minOrder: true, maxDiscount: true,
        descriptionBn: true, descriptionEn: true,
        scope: true, startsAt: true, endsAt: true,
        firstOrderOnly: true,
        isActive: true,
      },
    });
    if (!c) return { error: "Not found" };
    return c;
  }
}