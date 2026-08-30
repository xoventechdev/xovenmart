import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SmsService } from "../../shared/sms/sms.service";
import { NotificationService } from "../notifications/notifications.service";
import { ReferralsService } from "../referrals/referrals.service";
import { OrderStatus } from "@prisma/client";

const STATUS_BN: Record<OrderStatus, string> = {
  PENDING: "অপেক্ষমান",
  ACCEPTED: "গৃহীত",
  PREPARING: "প্রস্তুত হচ্ছে",
  PREPARED: "প্রস্তুত",
  OUT_FOR_DELIVERY: "ডেলিভারিতে",
  DELIVERED: "ডেলিভারি সম্পন্ন",
  CANCELLED: "বাতিল",
  RETURNED: "ফেরত",
  REFUNDED: "টাকা ফেরত",
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationService,
    private readonly referrals: ReferralsService,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // CUSTOMER — Track / history
  // ════════════════════════════════════════════════════════════════

  async getMyOrders(req: Request) {
    const userId = (req as any).userId;
    if (!userId) throw new UnauthorizedException("Login required");

    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      include: {
        items: true,
        delivery: { include: { rider: { select: { name: true, phone: true } } } },
      },
    });

    return orders.map((o: any) => this.serializeOrder(o));
  }

  /**
   * Lookup by order number (+ optional phone) — works for guests too.
   *
   * Public route. Behaviour:
   *   - orderNo alone → returns order, but masks sensitive fields
   *     (customer name, phone, full address, rider phone).
   *   - orderNo + correct phone → returns full order details.
   *   - orderNo + wrong phone → 404 (don't leak existence).
   *   - orderNo not found → 404.
   */
  async trackByOrderNo(orderNo: string, phone?: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      include: {
        user: { select: { phone: true, name: true } },
        items: true,
        delivery: { include: { rider: { select: { name: true, phone: true } } } },
        statusEvents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    // If phone provided, it must match user.phone or order.guestPhone.
    // If it doesn't match, behave as if the order doesn't exist (don't leak).
    if (phone && phone.length > 0) {
      const contactPhone = order.guestPhone || order.user?.phone || "";
      if (contactPhone !== phone) {
        throw new NotFoundException("Order not found");
      }
      return this.serializeOrder(order);
    }

    // No phone supplied: return a redacted view safe for public display.
    const masked = this.serializeOrder(order);
    const addr = order.addressSnapshot as any;
    return {
      ...masked,
      // Strip personal / private info
      guestName: order.guestName ? `${order.guestName[0]}${"•".repeat(Math.max(0, order.guestName.length - 1))}` : null,
      guestPhone: order.guestPhone
        ? `${order.guestPhone.slice(0, 4)}••••••`
        : null,
      address: addr
        ? {
            ...addr,
            // Drop full text + landmark + lat/lng from public view; keep area label.
            fullText: undefined,
            landmark: undefined,
            lat: undefined,
            lng: undefined,
            label: addr.area || addr.label || null,
          }
        : null,
      delivery: masked.delivery
        ? { ...masked.delivery, riderPhone: null }
        : null,
      // Drop order notes (might contain personal info)
      notes: null,
    };
  }

  async getMyOrderById(req: Request, orderId: string) {
    const userId = (req as any).userId;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        delivery: { include: { rider: { select: { name: true, phone: true } } } },
        statusEvents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.userId !== userId) throw new UnauthorizedException("Not your order");
    return this.serializeOrder(order);
  }

  // ════════════════════════════════════════════════════════════════
  // ADMIN / RIDER — Status updates
  // ════════════════════════════════════════════════════════════════

  async updateStatus(req: Request, orderId: string, newStatus: OrderStatus, note?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");

    // Permission check
    const role = (req as any).role as string;
    const userId = (req as any).userId as string;
    if (role === "RIDER") {
      // Riders can only mark OUT_FOR_DELIVERY or DELIVERED for orders assigned to them
      const delivery = await this.prisma.delivery.findUnique({ where: { orderId } });
      if (!delivery || delivery.riderId !== userId) {
        throw new UnauthorizedException("Not your delivery");
      }
      if (!["OUT_FOR_DELIVERY", "DELIVERED"].includes(newStatus)) {
        throw new BadRequestException("Riders can only mark OUT_FOR_DELIVERY or DELIVERED");
      }
    } else if (role !== "ADMIN") {
      throw new UnauthorizedException("Admin or rider required");
    }

    // Valid status transitions
    const allowed: Record<string, OrderStatus[]> = {
      PENDING: ["ACCEPTED", "CANCELLED"],
      ACCEPTED: ["PREPARING", "CANCELLED"],
      PREPARING: ["PREPARED", "CANCELLED"],
      PREPARED: ["OUT_FOR_DELIVERY", "CANCELLED"],
      OUT_FOR_DELIVERY: ["DELIVERED", "RETURNED", "CANCELLED"],
      DELIVERED: ["RETURNED"],
      RETURNED: ["REFUNDED"],
      CANCELLED: [],
      REFUNDED: [],
    };
    const valid = allowed[order.status] ?? [];
    if (!valid.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} → ${newStatus}. Allowed: ${valid.join(", ") || "(none)"}`,
      );
    }

    const prevStatus = order.status;
    if (prevStatus === newStatus) return this.serializeOrder(order);

    // Side effects per status
    await this.prisma.$transaction(async (tx) => {
      // Update order
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          ...(newStatus === "ACCEPTED" && { confirmedAt: new Date() }),
          ...(newStatus === "DELIVERED" && { deliveredAt: new Date() }),
          ...(newStatus === "CANCELLED" && { cancelledAt: new Date(), cancelledBy: userId }),
          ...(newStatus === "REFUNDED" && { cancelledAt: new Date() }),
        },
      });

      // Status event log
      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: prevStatus,
          toStatus: newStatus,
          actorId: userId,
          actorRole: role as any,
          note,
        },
      });

      // If delivered: free reserved stock, finalize payment (COD)
      if (newStatus === "DELIVERED") {
        // Reserved qty is freed implicitly when stockQty already decremented
        // Mark COD payment as VERIFIED
        await tx.payment.updateMany({
          where: { orderId, status: "PENDING" },
          data: { status: "VERIFIED", verifiedAt: new Date(), verifiedBy: userId },
        });
        await tx.order.update({
          where: { id: orderId },
          data: { paymentStatus: "VERIFIED" },
        });
      }

      // If cancelled: release reserved stock
      if (newStatus === "CANCELLED") {
        const items = await tx.orderItem.findMany({ where: { orderId } });
        for (const it of items) {
          await tx.inventory.update({
            where: { productId: it.productId },
            data: {
              stockQty: { increment: it.qty },
              reservedQty: { decrement: it.qty },
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: it.productId,
              delta: it.qty,
              reason: "RETURN",
              refOrderId: orderId,
              createdBy: userId,
              note: "Order cancelled — stock released",
            },
          });
        }
        // Decrement coupon usage if a coupon was used
        if (order.couponId) {
          await tx.discount.update({
            where: { id: order.couponId },
            data: { usedCount: { decrement: 1 } },
          });
        }
      }
    });

    // ─── Notify customer on every step ───
    try {
      await this.notifications.notifyOrderStatusChange(orderId, newStatus, STATUS_BN[newStatus]);
    } catch (e) {
      this.logger.warn(`Notification failed for order ${orderId}: ${(e as Error).message}`);
    }

    // ─── Referral reward on first delivered order ───
    if (newStatus === "DELIVERED") {
      try {
        await this.referrals.onOrderDelivered(orderId);
      } catch (e) {
        this.logger.warn(`Referral reward failed for order ${orderId}: ${(e as Error).message}`);
      }
    }

    // Re-fetch
    const fresh = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, delivery: true },
    });
    return this.serializeOrder(fresh);
  }

  // ════════════════════════════════════════════════════════════════
  // Serialization
  // ════════════════════════════════════════════════════════════════

  private serializeOrder = (o: any) => ({
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    statusBn: STATUS_BN[o.status as OrderStatus] ?? o.status,
    subtotal: Number(o.subtotal),
    discountTotal: Number(o.discountTotal),
    deliveryFee: Number(o.deliveryFee),
    grandTotal: Number(o.grandTotal),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    address: o.addressSnapshot,
    guestName: o.guestName,
    guestPhone: o.guestPhone,
    couponCode: o.couponCode,
    notes: o.notes,
    items: o.items?.map((i: any) => ({
      productId: i.productId,
      name: i.nameSnapshot,
      qty: i.qty,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
    })),
    delivery: o.delivery
      ? {
          riderName: o.delivery.rider?.name,
          riderPhone: o.delivery.rider?.phone,
          assignedAt: o.delivery.assignedAt,
          deliveredAt: o.delivery.deliveredAt,
          proofStatus: o.delivery.proofStatus,
        }
      : null,
    statusEvents: o.statusEvents?.map((e: any) => ({
      from: e.fromStatus,
      to: e.toStatus,
      note: e.note,
      at: e.createdAt,
    })),
    placedAt: o.placedAt,
    confirmedAt: o.confirmedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
  });
}