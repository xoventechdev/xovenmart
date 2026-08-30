import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { CatalogService } from "../catalog/catalog.service";
import { CreatePosOrderDto } from "./dto";
import { Prisma } from "@prisma/client";

/**
 * POS (Quick Order) service.
 *
 * Mirrors the customer checkout flow but for orders that come in via
 * WhatsApp / phone call / walk-in (admin enters them on the customer's
 * behalf). Key differences from CheckoutService:
 *
 *   • No auth check — actor is the admin (captured for audit from req.userId).
 *   • No delivery-zone / weight-based delivery-fee calc — the cashier enters
 *     the fee manually (or skips it for pickup).
 *   • No server-side coupon engine — discounts are typed in by the cashier.
 *   • Any PaymentMethod accepted (CASH default; COD/MANUAL_BKASH also
 *     common). The cashier decides.
 *   • Order is marked CONFIRMED by default (admin accepted the order),
 *     not PENDING (which is for unfinished web checkouts).
 *   • Source column is locked to "POS".
 *
 * The transaction body is intentionally similar to CheckoutService.place()
 * so both code paths look right to anyone reading the schema.
 */
@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // CUSTOMER LOOKUP
  // ════════════════════════════════════════════════════════════════

  /**
   * Lookup a customer by phone. Returns null when not found (so the admin
   * can decide to create a guest order). We accept either with or without
   * the +88 prefix so cashiers don't have to normalize.
   */
  async lookupCustomerByPhone(phone: string) {
    const normalized = phone.replace(/^\+?88/, "");
    if (!/^01[3-9]\d{8}$/.test(normalized)) {
      throw new BadRequestException("Invalid Bangladesh phone");
    }
    const user = await this.prisma.user.findUnique({
      where: { phone: normalized },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        referralCode: true,
        isBlocked: true,
        createdAt: true,
        _count: { select: { orders: true, addresses: true } },
      },
    });
    return user;
  }

  /**
   * Lightweight product search for the Quick Order screen.
   * Returns id, name (EN+BN), salePrice, stockQty in one row.
   */
  async searchProducts(term: string, limit = 12) {
    const q = (term ?? "").trim();
    if (!q) return [];
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { nameBn: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      take: Math.min(limit, 30),
      orderBy: [{ isFeatured: "desc" }, { nameEn: "asc" }],
      select: {
        id: true,
        slug: true,
        nameBn: true,
        nameEn: true,
        sku: true,
        salePrice: true,
        mrp: true,
        unit: true,
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        inventory: { select: { stockQty: true, reservedQty: true } },
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // PLACE ORDER
  // ════════════════════════════════════════════════════════════════

  /**
   * Place a POS order on behalf of a customer.
   *
   * @param dto        Order payload (cashier-typed)
   * @param actorId    Admin/Manager userId (for audit + OrderStatusEvent)
   * @param actorRole  "ADMIN" or "MANAGER"
   */
  async place(dto: CreatePosOrderDto, actorId: string, actorRole: "ADMIN" | "MANAGER") {
    // ─── Resolve customer ───
    const normalizedPhone = dto.customerPhone.replace(/^\+?88/, "");
    const existing = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true, isBlocked: true },
    });

    let userId: string | null = null;
    let guestName: string | null = null;
    let guestPhone: string | null = null;

    if (existing) {
      if (existing.isBlocked) {
        throw new BadRequestException("Customer is blocked — cannot place order");
      }
      userId = existing.id;
    } else {
      if (!dto.customerName || dto.customerName.trim().length < 2) {
        throw new BadRequestException(
          "No registered customer with this phone. Provide a name to save the order as a guest.",
        );
      }
      guestName = dto.customerName.trim();
      guestPhone = normalizedPhone;
    }

    // ─── Validate items + stock ───
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("Order must have at least one item");
    }
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: { inventory: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const errors: string[] = [];
    const lineItems: Array<{
      productId: string;
      nameSnapshot: string;
      unitPrice: number;
      qty: number;
      lineTotal: number;
      weightGrams: number;
    }> = [];

    for (const it of dto.items) {
      const p = productMap.get(it.productId);
      if (!p) {
        errors.push(`Product ${it.productId} not found or inactive`);
        continue;
      }
      const stock = p.inventory?.stockQty ?? 0;
      if (stock < it.qty) {
        errors.push(`"${p.nameEn}" — only ${stock} in stock`);
        continue;
      }
      const unitPrice = Number(p.salePrice);
      const lineTotal = unitPrice * it.qty;
      lineItems.push({
        productId: p.id,
        nameSnapshot: `${p.nameBn} / ${p.nameEn}`,
        unitPrice,
        qty: it.qty,
        lineTotal,
        weightGrams: p.weightGrams ?? 1000,
      });
    }
    if (errors.length) throw new BadRequestException({ message: "Item validation failed", errors });

    // ─── Pricing (cashier-entered) ───
    const subtotal = Number(dto.subtotal);
    const discountTotal = Number(dto.discountTotal ?? 0);
    const deliveryFee = Number(dto.deliveryFee ?? 0);
    if (discountTotal > subtotal) {
      throw new BadRequestException("Discount cannot exceed subtotal");
    }
    if (deliveryFee < 0) {
      throw new BadRequestException("Delivery fee cannot be negative");
    }
    const computedGrandTotal = subtotal - discountTotal + deliveryFee;

    // ─── Determine initial status + payment state ───
    const initialStatus = dto.initialStatus ?? "ACCEPTED";
    const markAsPaid = dto.markAsPaid ?? (dto.paymentMethod === "CASH" || dto.paymentMethod === "MANUAL_BKASH");
    const paymentStatus = markAsPaid ? "VERIFIED" : "PENDING";

    // ─── Order number ───
    const orderNo = await this.generateOrderNo();

    // ─── Create order in transaction ───
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo,
          userId,
          guestName,
          guestPhone,
          addressSnapshot: dto.address as unknown as Prisma.JsonObject,
          status: initialStatus,
          subtotal,
          discountTotal,
          deliveryFee,
          grandTotal: computedGrandTotal,
          paymentMethod: dto.paymentMethod,
          paymentStatus,
          notes: dto.notes ?? null,
          source: "POS",
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
              fromStatus: null,
              toStatus: initialStatus,
              actorId,
              actorRole,
              note: `Order placed via POS by ${actorRole.toLowerCase()}`,
            },
          },
          payments: {
            create: {
              provider: dto.paymentMethod,
              amount: computedGrandTotal,
              status: paymentStatus,
              verifiedBy: markAsPaid ? actorId : null,
              verifiedAt: markAsPaid ? new Date() : null,
            },
          },
        },
        include: { items: true, payments: true },
      });

      // Reserve stock + log movement
      for (const li of lineItems) {
        await tx.inventory.update({
          where: { productId: li.productId },
          data: {
            stockQty: { decrement: li.qty },
            reservedQty: { increment: li.qty },
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: li.productId,
            delta: -li.qty,
            reason: "SALE",
            refOrderId: created.id,
            createdBy: actorId,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole,
          entity: "order",
          entityId: created.id,
          action: "pos.create",
          diff: {
            orderNo,
            customerPhone: normalizedPhone,
            paymentMethod: dto.paymentMethod,
            paymentStatus,
            source: "POS",
            grandTotal: computedGrandTotal,
          },
        },
      });

      return created;
    });

    this.logger.log(
      `POS order ${orderNo} placed by ${actorRole} ${actorId} for ${
        userId ? `user ${userId}` : `guest ${guestPhone}`
      } — ৳${computedGrandTotal} via ${dto.paymentMethod}`,
    );

    // The Prisma return type for the create() call doesn't infer nested
    // relation includes in a transactional callback, so cast to any for the
    // result-shape return.
    const o = order as any;

    return {
      ok: true,
      order: {
        id: o.id,
        orderNo: o.orderNo,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        source: o.source,
        grandTotal: Number(o.grandTotal),
        subtotal: Number(o.subtotal),
        discountTotal: Number(o.discountTotal),
        deliveryFee: Number(o.deliveryFee),
        createdAt: o.placedAt,
        customer: userId
          ? { type: "registered", userId }
          : { type: "guest", name: guestName, phone: guestPhone },
        items: (o.items ?? []).map((i: any) => ({
          productId: i.productId,
          name: i.nameSnapshot,
          qty: i.qty,
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.lineTotal),
        })),
        payment: o.payments?.[0]
          ? {
              id: o.payments[0].id,
              provider: o.payments[0].provider,
              amount: Number(o.payments[0].amount),
              status: o.payments[0].status,
            }
          : null,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────

  /**
   * Order-number generator — same shape as CheckoutService.generateOrderNo
   * so admins see a continuous sequence (XVM-YYYYMMDD-NNN).
   */
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
