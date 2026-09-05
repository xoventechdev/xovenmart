import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SmsService } from "../../shared/sms/sms.service";
import { CatalogService } from "../catalog/catalog.service";
import { TemplatesService } from "../templates/templates.service";
import { NotificationService } from "../notifications/notifications.service";
import { CheckoutDto } from "./dto";
import { AddressType, Prisma, DiscountType } from "@prisma/client";
import {
  isCanonicalBDPhone,
  normalizeBDPhone,
  toE164BD,
} from "../../shared/phone";

/**
 * Mirror of the address-form-modal / customers.service labelForType. We
 * duplicate the small map here so the snapshot keeps a sensible label even
 * when the caller only passed `type`.
 */
function labelForType(type: AddressType): string {
  switch (type) {
    case AddressType.HOME:
      return "Home";
    case AddressType.OFFICE:
      return "Office";
    case AddressType.OTHER:
    default:
      return "Other";
  }
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly sms: SmsService,
    private readonly templates: TemplatesService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Place an order. Supports both registered and guest checkout.
   *
   * Flow:
   *  1. Resolve user (registered from token OR guest by phone).
   *  2. Validate stock + price items server-side.
   *  3. Compute delivery fee via lat/lng.
   *  4. Apply coupon (if any) — validate scope + eligibility.
   *  5. Create Order + OrderItems + OrderStatusEvent + Payment(COD) in a tx.
   *  6. Reserve stock.
   *  7. Send confirmation SMS.
   */
  async place(dto: CheckoutDto, req: Request) {
    const tokenUserId = (req as any).userId as string | undefined;
    const tokenRole = (req as any).role as string | undefined;

    // ─── Resolve customer ───
    let userId: string | null = null;
    let guestName: string | null = null;
    let guestPhone: string | null = null;
    let contactPhone: string | null = null;

    if (tokenRole === "CUSTOMER" && tokenUserId) {
      const u = await this.prisma.user.findUnique({
        where: { id: tokenUserId },
      });
      if (!u) throw new BadRequestException("Invalid token user");
      userId = u.id;
      contactPhone = u.phone;
      guestName = null;
      guestPhone = null;
    } else {
      // Guest
      if (!dto.guestPhone || !dto.guestName) {
        throw new BadRequestException("Guest checkout requires name + phone");
      }
      // DTO `@Transform` already stripped `+88`/`88`, but re-check here as
      // defence-in-depth (skipping the DTO layer should not corrupt the DB).
      const canonicalGuestPhone = normalizeBDPhone(dto.guestPhone);
      if (!isCanonicalBDPhone(canonicalGuestPhone)) {
        throw new BadRequestException("Invalid Bangladesh phone");
      }
      // If a user with this phone already exists, optionally link the order
      // to them. Otherwise, just store guest info.
      const existing = await this.prisma.user.findUnique({
        where: { phone: canonicalGuestPhone },
      });
      if (existing) {
        userId = existing.id;
      }
      guestName = dto.guestName;
      // Store the canonical local form (no `+88` prefix) so the public
      // track endpoint can compare with the user-typed input directly.
      guestPhone = canonicalGuestPhone;
      contactPhone = canonicalGuestPhone;
    }

    // ─── Price items server-side ───
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("Cart is empty");
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: { inventory: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const errors: string[] = [];
    const lineItems: any[] = [];
    let subtotal = 0;

    for (const it of dto.items) {
      const p = productMap.get(it.productId);
      if (!p) {
        errors.push(`Product ${it.productId} not found`);
        continue;
      }
      const stock = p.inventory?.stockQty ?? 0;
      if (stock < it.qty) {
        errors.push(`"${p.nameEn}" — only ${stock} in stock`);
        continue;
      }
      const unitPrice = Number(p.salePrice);
      const lineTotal = unitPrice * it.qty;
      subtotal += lineTotal;
      lineItems.push({
        productId: p.id,
        nameSnapshot: `${p.nameBn} / ${p.nameEn}`,
        unitPrice,
        qty: it.qty,
        lineTotal,
        weightGrams: p.weightGrams ?? 1000,
      });
    }

    if (errors.length > 0) {
      throw new BadRequestException({ message: "Cart validation failed", errors });
    }

    // ─── Delivery fee (distance + weight) ───
    const feeResult = await this.catalog.calcDeliveryFee(
      dto.address.lat,
      dto.address.lng,
      subtotal,
      lineItems.map((li) => ({ qty: li.qty, weightGrams: li.weightGrams })),
    );
    if (feeResult.outsideAllZones) {
      throw new BadRequestException(feeResult.message || "এই এলাকায় ডেলিভারি সম্ভব নয়");
    }
    let deliveryFee = feeResult.deliveryFee;

    // ─── Apply coupon ───
    let discountTotal = 0;
    let appliedCoupon: { code: string; id: string; type: DiscountType } | null = null;
    if (dto.couponCode) {
      const result = await this.applyCoupon(
        dto.couponCode,
        userId,
        subtotal,
        lineItems,
      );
      if (result.error) throw new BadRequestException(result.error);
      discountTotal = result.discountAmount!;
      appliedCoupon = { code: result.code!, id: result.id!, type: result.type! };
      if (result.type === DiscountType.FREE_DELIVERY) deliveryFee = 0;
    }

    const grandTotal = subtotal - discountTotal + deliveryFee;

    // ─── Generate order number ───
    const orderNo = await this.generateOrderNo();

    // ─── Normalize the address snapshot ───
    // We persist BOTH the slot `type` (new) and the legacy free-text
    // `label` so:
    //   - older tracking pages that only render `label` keep working
    //   - new admin-side reporting can group by delivery destination type
    //   - the Android app (out of scope for this redesign) keeps reading
    //     `label` until a future Android pass picks up `type`
    const resolvedAddressType: AddressType = dto.address.type ?? AddressType.HOME;
    const resolvedLabel: string =
      dto.address.label !== undefined && dto.address.label.trim() !== ""
        ? dto.address.label.trim()
        : labelForType(resolvedAddressType);
    const addressSnapshot: Prisma.JsonObject = {
      ...(dto.address as unknown as Prisma.JsonObject),
      type: resolvedAddressType,
      label: resolvedLabel,
    };

    // ─── Create order in transaction ───
    const order = await this.prisma.$transaction(async (tx) => {
      // Order
      const created = await tx.order.create({
        data: {
          orderNo,
          userId,
          guestName,
          guestPhone,
          addressSnapshot,
          status: "PENDING",
          subtotal,
          discountTotal,
          deliveryFee,
          grandTotal,
          paymentMethod: dto.paymentMethod,
          paymentStatus: "PENDING",
          couponCode: appliedCoupon?.code ?? null,
          couponId: appliedCoupon?.id ?? null,
          notes: dto.notes ?? null,
          // Channel the order came in on. Schema defaults to WEB so this is
          // basically always set, but we pass it explicitly so the Android
          // app can mark its orders as ANDROID for analytics / filtering.
          source: dto.source ?? "WEB",
          items: {
            create: lineItems.map((li) => ({
              productId: li.productId,
              nameSnapshot: li.nameSnapshot,
              unitPrice: li.unitPrice,
              qty: li.qty,
              lineTotal: li.lineTotal,
              weightGramsSnapshot: li.weightGrams,
            })),
          },
          statusEvents: {
            create: {
              toStatus: "PENDING",
              actorRole: userId ? "ADMIN" : undefined,
              note: userId ? "Order placed by registered customer" : "Order placed by guest",
            },
          },
          payments: {
            create: {
              provider: "COD",
              amount: grandTotal,
              status: "PENDING",
            },
          },
        },
        include: { items: true, payments: true },
      });

      // Reserve stock
      for (const it of dto.items) {
        await tx.inventory.update({
          where: { productId: it.productId },
          data: {
            stockQty: { decrement: it.qty },
            reservedQty: { increment: it.qty },
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            delta: -it.qty,
            reason: "SALE",
            refOrderId: created.id,
            createdBy: userId,
          },
        });
      }

      // Increment coupon usage. If this was a referral coupon, also stamp
      // the matching ReferralReward row's `redeemedAt` so the customer's
      // /account/referrals page transitions the entry from "Use it" to
      // "USED" instead of leaving the badge stuck forever. Without this
      // write, Discount.usedCount would tick but the dashboard would
      // never know the coupon was actually spent.
      if (appliedCoupon) {
        await tx.discount.update({
          where: { id: appliedCoupon.id },
          data: { usedCount: { increment: 1 } },
        });
        if (userId) {
          await tx.referralReward.updateMany({
            where: {
              userId,
              couponCode: appliedCoupon.code,
              redeemedAt: null,
            },
            data: { redeemedAt: new Date() },
          });
        }
      }

      return created;
    });

    // ─── SMS confirmation (best effort) ───
    // SMS gateway expects E.164 (`+880XXXXXXXXXX`); internal storage
    // is the local form. Convert at the dispatch boundary.
    if (contactPhone) {
      const smsNumber = toE164BD(contactPhone);
      if (smsNumber) {
        try {
          await this.sms.sendOrderConfirmation(smsNumber, orderNo);
        } catch (e) {
          this.logger.warn(`SMS confirmation failed for ${orderNo}: ${(e as Error).message}`);
        }
      }
    }

    // ─── Email confirmation (best effort) ───
    // Source the recipient email from the registered user's record
    // (guest checkout doesn't currently collect an email). The template
    // (`email.order_placed`) is bilingual — recipient locale drives the
    // picked body.
    if (userId) {
      try {
        const recipient = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });
        if (recipient?.email) {
          const locale = await this.templates.resolveLocale(userId);
          const vars: Record<string, unknown> = {
            orderNo,
            customerName: recipient.name || guestName || "Customer",
            itemCount: dto.items.length,
            subtotal,
            deliveryFee,
            total: grandTotal,
            address: (order as any).addressText ?? "",
            paymentMethod: (order as any).paymentMethod ?? "CASH",
            url: `${process.env.PUBLIC_WEB_URL ?? "https://xovenmart.com"}/orders/${orderNo}`,
          };
          const rendered = await this.templates.renderEmail("email", "order_placed", vars, locale);
          await this.notifications.sendEmailForTemplate({
            to: recipient.email,
            subject: rendered.subject || `Order ${orderNo} confirmed`,
            text: rendered.body,
            html: rendered.html,
            purpose: rendered.emailPurpose ?? "ORDERS",
          });
        }
      } catch (e) {
        this.logger.warn(`Email confirmation failed for ${orderNo}: ${(e as Error).message}`);
      }
    }

    return {
      ok: true,
      order: {
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
        grandTotal: Number(order.grandTotal),
        subtotal: Number(order.subtotal),
        discountTotal: Number(order.discountTotal),
        deliveryFee: Number(order.deliveryFee),
        paymentMethod: order.paymentMethod,
        createdAt: order.placedAt,
        items: order.items.map((i: any) => ({
          productId: i.productId,
          name: i.nameSnapshot,
          qty: i.qty,
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.lineTotal),
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────

  private async applyCoupon(
    code: string,
    userId: string | null,
    subtotal: number,
    lineItems: any[],
  ) {
    const upper = code.toUpperCase();
    const now = new Date();
    const discount = await this.prisma.discount.findUnique({
      where: { code: upper },
      include: { products: true, categories: { include: { category: { include: { children: true } } } } },
    });
    if (!discount) return { error: "Invalid coupon code" };
    if (!discount.isActive) return { error: "Coupon is inactive" };
    if (discount.startsAt > now) return { error: "Coupon not yet active" };
    if (discount.endsAt < now) return { error: "Coupon has expired" };
    if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
      return { error: "Coupon usage limit reached" };
    }
    if (discount.restrictedUserId && discount.restrictedUserId !== userId) {
      return { error: "Coupon not valid for this account" };
    }
    if (subtotal < Number(discount.minOrder)) {
      return { error: `Minimum order ৳${Number(discount.minOrder)} required` };
    }

    // First-order-only check
    if (discount.firstOrderOnly && userId) {
      const prior = await this.prisma.order.count({
        where: { userId, status: "DELIVERED" },
      });
      if (prior > 0) return { error: "Coupon valid only for first order" };
    }

    // Per-user usage limit
    if (userId) {
      const myUsage = await this.prisma.order.count({
        where: { userId, couponId: discount.id, status: { not: "CANCELLED" } },
      });
      if (myUsage >= discount.usagePerUserLimit) {
        return { error: `Coupon usage limit (${discount.usagePerUserLimit}) reached for your account` };
      }
    }

    // Scope check
    let eligibleAmount = subtotal;
    if (discount.scope === "SPECIFIC_PRODUCTS") {
      const productIds = new Set(discount.products.map((p: any) => p.productId));
      eligibleAmount = lineItems
        .filter((li: any) => productIds.has(li.productId))
        .reduce((acc, li: any) => acc + li.lineTotal, 0);
      if (eligibleAmount === 0) return { error: "Coupon does not apply to items in cart" };
    } else if (discount.scope === "SPECIFIC_CATEGORIES") {
      // Build set of category IDs (include sub-categories recursively)
      const catIds = new Set<string>();
      for (const dc of discount.categories as any[]) {
        catIds.add(dc.categoryId);
        for (const child of dc.category.children ?? []) {
          catIds.add(child.id);
        }
      }
      const productIds = lineItems.map((li: any) => li.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, categoryId: true },
      });
      const eligible = products.filter((p) => catIds.has(p.categoryId));
      if (eligible.length === 0) return { error: "Coupon does not apply to items in cart" };
      eligibleAmount = lineItems
        .filter((li: any) => eligible.some((e) => e.id === li.productId))
        .reduce((acc, li: any) => acc + li.lineTotal, 0);
    }

    let discountAmount = 0;
    if (discount.type === DiscountType.PERCENT) {
      discountAmount = (eligibleAmount * Number(discount.value)) / 100;
      if (discount.maxDiscount) {
        discountAmount = Math.min(discountAmount, Number(discount.maxDiscount));
      }
    } else if (discount.type === DiscountType.FLAT) {
      discountAmount = Math.min(Number(discount.value), eligibleAmount);
    } else if (discount.type === DiscountType.FREE_DELIVERY) {
      discountAmount = 0;
    }

    return {
      code: upper,
      id: discount.id,
      type: discount.type,
      discountAmount: round(discountAmount),
      scope: discount.scope,
    };
  }

  private async generateOrderNo(): Promise<string> {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const prefix = `XVM-${yy}${mm}${dd}`;

    const lastToday = await this.prisma.order.findFirst({
      where: { orderNo: { startsWith: prefix } },
      orderBy: { orderNo: "desc" },
    });

    let seq = 1;
    if (lastToday) {
      const lastSeq = parseInt(lastToday.orderNo.slice(prefix.length + 1), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}-${String(seq).padStart(3, "0")}`;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}