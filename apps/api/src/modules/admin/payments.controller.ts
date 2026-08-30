import {
  BadRequestException,
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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/payments")
@Controller("admin/payments")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminPaymentsController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────

  private include() {
    return {
      order: {
        select: {
          id: true,
          orderNo: true,
          grandTotal: true,
          paymentMethod: true,
          paymentStatus: true,
          user: { select: { id: true, name: true, phone: true } },
          guestName: true,
          guestPhone: true,
        },
      },
    };
  }

  private toDto(p: any) {
    return {
      id: p.id,
      orderId: p.orderId,
      orderNo: p.order?.orderNo ?? null,
      provider: p.provider,
      amount: Number(p.amount),
      senderMsisdn: p.senderMsisdn,
      trxId: p.trxId,
      status: p.status,
      verifiedBy: p.verifiedBy,
      verifiedAt: p.verifiedAt,
      rawPayload: p.rawPayload,
      createdAt: p.createdAt,
      customer: p.order?.user
        ? { name: p.order.user.name, phone: p.order.user.phone, type: "user" }
        : { name: p.order?.guestName ?? null, phone: p.order?.guestPhone ?? null, type: "guest" },
    };
  }

  // ─── Routes ───────────────────────────────────────────────────

  @Get()
  async list(
    @Query() q: {
      status?: string;
      provider?: string;
      orderId?: string;
      page?: number;
      perPage?: number;
    },
  ) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.provider) where.provider = q.provider;
    if (q.orderId) where.orderId = q.orderId;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: this.include(),
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: items.map((i: any) => this.toDto(i)),
      page,
      perPage,
      total,
    };
  }

  @Get("pending")
  async pending(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: "PENDING" },
        include: this.include(),
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.count({ where: { status: "PENDING" } }),
    ]);
    return { items: items.map((i: any) => this.toDto(i)), page, perPage, total };
  }

  @Get("cod")
  async cod(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    // COD orders awaiting verification: status=PENDING, paymentStatus=PENDING, order delivered or out for delivery
    const where = {
      provider: "COD" as any,
      status: "PENDING" as any,
      order: { status: { in: ["DELIVERED", "OUT_FOR_DELIVERY", "PREPARED"] as any } },
    };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: this.include(),
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items: items.map((i: any) => this.toDto(i)), page, perPage, total };
  }

  @Get("refunds")
  async refunds(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: "REFUNDED" },
        include: this.include(),
        skip: (page - 1) * perPage,
        take: perPage,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.payment.count({ where: { status: "REFUNDED" } }),
    ]);
    return { items: items.map((i: any) => this.toDto(i)), page, perPage, total };
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        ...this.include(),
        order: {
          include: {
            items: true,
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
      },
    });
    if (!p) return null;
    return {
      ...this.toDto(p),
      order: p.order
        ? {
            ...p.order,
            grandTotal: Number(p.order.grandTotal),
            items: p.order.items?.map((it: any) => ({
              ...it,
              unitPrice: Number(it.unitPrice),
              lineTotal: Number(it.lineTotal),
            })),
          }
        : null,
    };
  }

  @Patch(":id/verify")
  @AdminOnly()
  async verify(@Param("id") id: string, @Body() body: { status: string }, @Req() req: Request) {
    const allowed = ["VERIFIED", "FAILED"];
    if (!body || !allowed.includes(body.status)) {
      throw new BadRequestException(`status must be one of: ${allowed.join(", ")}`);
    }
    const actorId = (req as any).userId;
    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: body.status as any,
        verifiedBy: actorId,
        verifiedAt: new Date(),
      },
      include: this.include(),
    });
    if (body.status === "VERIFIED" && updated.orderId) {
      await this.prisma.order.update({
        where: { id: updated.orderId },
        data: { paymentStatus: "VERIFIED" },
      });
    } else if (body.status === "FAILED" && updated.orderId) {
      await this.prisma.order.update({
        where: { id: updated.orderId },
        data: { paymentStatus: "FAILED" },
      });
    }
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "payment",
          entityId: id,
          action: body.status === "VERIFIED" ? "verify_payment" : "fail_payment",
          diff: { status: body.status },
        },
      });
    }
    return this.toDto(updated);
  }

  @Post("refunds")
  @AdminOnly()
  async createRefund(@Body() body: any, @Req() req: Request) {
    if (!body?.orderId) {
      throw new BadRequestException("orderId is required");
    }
    if (typeof body.amount !== "number" && typeof body.amount !== "string") {
      throw new BadRequestException("amount (number) is required");
    }
    if (!body.reason) {
      throw new BadRequestException("reason is required");
    }
    const actorId = (req as any).userId;
    const order = await this.prisma.order.findUnique({ where: { id: body.orderId } });
    if (!order) throw new BadRequestException(`Order ${body.orderId} not found`);

    const amount = Number(body.amount);

    // Create the refund Payment row
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: order.paymentMethod,
        amount,
        status: "REFUNDED",
        rawPayload: { reason: body.reason, kind: "refund" } as any,
        verifiedBy: actorId ?? null,
        verifiedAt: new Date(),
      },
    });

    // Update order
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: "REFUNDED",
        paymentStatus: "REFUNDED",
        cancelledReason: body.reason,
        cancelledBy: actorId ?? null,
        cancelledAt: new Date(),
      },
    });

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "refund",
          entityId: payment.id,
          action: "create_refund",
          diff: { orderId: body.orderId, amount, reason: body.reason },
        },
      });
    }

    return { ok: true, id: payment.id, orderId: order.id, amount, reason: body.reason, status: "REFUNDED" };
  }
}
