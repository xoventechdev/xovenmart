import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { AddToCartDto, CartItemDto, UpdateCartItemDto } from "./dto";

/**
 * Cart is stored SERVER-SIDE for both guests and registered users.
 * Guests: identified by `cartId` cookie value (UUID stored in cart.metadata as guest).
 * Registered: appended to User.cart (we add cart metadata via a User-side preference if needed).
 *
 * NOTE: Schema doesn't yet have a `cart` table. Day 1 simplification:
 *   - We'll store cart in Redis (Phase 1 final impl).
 *   - For now, we expose a stateless approach using a "cart token" passed by
 *     the client (e.g. an HTTP-only cookie) and compute totals on demand.
 *
 * This service computes an IN-MEMORY cart total + validation only.
 * Persistence comes when Redis is added in Phase 1.5.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate items, compute totals, optionally apply a coupon.
   * Returns the priced cart and any errors.
   */
  async price(items: CartItemDto[], couponCode?: string | null) {
    if (!items || items.length === 0) {
      return {
        items: [],
        subtotal: 0,
        discountTotal: 0,
        deliveryFee: 0,
        grandTotal: 0,
        itemCount: 0,
        errors: [],
      };
    }

    const errors: string[] = [];
    const priced: any[] = [];
    let subtotal = 0;

    for (const it of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: it.productId },
        include: { inventory: true, images: { take: 1, orderBy: { sortOrder: "asc" } } },
      });

      if (!product) {
        errors.push(`Product ${it.productId} not found`);
        continue;
      }
      if (!product.isActive) {
        errors.push(`"${product.nameEn}" is no longer available`);
        continue;
      }
      const stock = product.inventory?.stockQty ?? 0;
      if (stock < it.qty) {
        errors.push(`"${product.nameEn}" — only ${stock} in stock`);
        continue;
      }

      const unitPrice = Number(product.salePrice);
      const mrp = Number(product.mrp);
      const lineTotal = unitPrice * it.qty;
      subtotal += lineTotal;

      priced.push({
        productId: product.id,
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        unit: product.unit,
        qty: it.qty,
        unitPrice,
        mrp,
        lineTotal,
        image: product.images?.[0]?.url ?? null,
        inStock: true,
      });
    }

    let discountTotal = 0;
    let couponResult: any = null;
    if (couponCode && errors.length === 0) {
      couponResult = await this.applyCoupon(couponCode, subtotal, priced);
      if (couponResult.error) {
        errors.push(couponResult.error);
      } else {
        discountTotal = couponResult.discountAmount;
      }
    }

    return {
      items: priced,
      subtotal: round(subtotal),
      discountTotal: round(discountTotal),
      deliveryFee: 0, // calculated separately with location
      grandTotal: round(subtotal - discountTotal),
      itemCount: priced.reduce((acc, x) => acc + x.qty, 0),
      coupon: couponResult,
      errors,
    };
  }

  /**
   * Coupon logic is duplicated here from CouponsService to avoid a circular
   * dependency. CouponsService uses CartService.price() output for scope checks.
   * Both share the same algorithm — keep in sync.
   */
  private async applyCoupon(code: string, subtotal: number, items: any[]) {
    const upper = code.toUpperCase();
    const now = new Date();
    const discount = await this.prisma.discount.findUnique({
      where: { code: upper },
      include: { products: true, categories: true },
    });

    if (!discount) return { error: "Invalid coupon code" };
    if (!discount.isActive) return { error: "Coupon is inactive" };
    if (discount.startsAt > now) return { error: "Coupon not yet active" };
    if (discount.endsAt < now) return { error: "Coupon has expired" };
    if (discount.usageLimit !== null && discount.usedCount >= discount.usageLimit) {
      return { error: "Coupon usage limit reached" };
    }
    if (subtotal < Number(discount.minOrder)) {
      return { error: `Minimum order ৳${Number(discount.minOrder)} required` };
    }

    let eligibleAmount = subtotal;
    if (discount.scope === "SPECIFIC_PRODUCTS") {
      const productIds = new Set(discount.products.map((p: any) => p.productId));
      eligibleAmount = items
        .filter((i: any) => productIds.has(i.productId))
        .reduce((acc, i: any) => acc + i.lineTotal, 0);
      if (eligibleAmount === 0) return { error: "Coupon does not apply to items in cart" };
    } else if (discount.scope === "SPECIFIC_CATEGORIES") {
      const catIds = new Set(discount.categories.map((c: any) => c.categoryId));
      // For simplicity Day 1: scope-check by direct category match only.
      // (Sub-category inclusion would require recursive lookup.)
      const eligibleIds = items
        .filter(() => true) // We don't have category on items here; defer to CouponsService for full check
        .map((i: any) => i.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: eligibleIds } },
        select: { id: true, categoryId: true },
      });
      const eligible = products.filter((p) => catIds.has(p.categoryId));
      if (eligible.length === 0) return { error: "Coupon does not apply to items in cart" };
    }

    let discountAmount = 0;
    if (discount.type === "PERCENT") {
      discountAmount = (eligibleAmount * Number(discount.value)) / 100;
      if (discount.maxDiscount) {
        discountAmount = Math.min(discountAmount, Number(discount.maxDiscount));
      }
    } else if (discount.type === "FLAT") {
      discountAmount = Number(discount.value);
    } else if (discount.type === "FREE_DELIVERY") {
      discountAmount = 0; // delivery-fee discounted in checkout
    }

    return {
      code: upper,
      type: discount.type,
      discountAmount: round(discountAmount),
      scope: discount.scope,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}