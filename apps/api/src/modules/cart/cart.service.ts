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
      // Phase 1 variants: when `it.variantId` is set, the line is for a
      // specific ProductVariant — we resolve the price + stock from the
      // variant row (and its VariantInventory), not the parent product.
      // When variantId is null/undefined we fall back to the legacy
      // single-SKU path (product.salePrice / product.inventory.stockQty).
      const variantId = it.variantId ?? null;
      let variant: { id: string; name: string; priceSale: any; priceMrp: any; stockQty: number; isActive: boolean; product: { id: string; isActive: boolean; nameBn: string; nameEn: string; unit: string; slug: string; mrp: any; salePrice: any; images: { url: string }[] } } | null = null;
      if (variantId) {
        variant = await this.prisma.productVariant.findUnique({
          where: { id: variantId },
          include: {
            product: {
              include: {
                images: { take: 1, orderBy: { sortOrder: "asc" } },
              },
            },
          },
        });
        // Validate the chain: variant exists, variant is active, parent
        // product exists, parent is active. ANY break → drop the line
        // with a friendly error.
        if (!variant) {
          errors.push(`Variant ${variantId} not found`);
          continue;
        }
        if (!variant.isActive) {
          errors.push(`Variant "${variant.name}" is no longer available`);
          continue;
        }
        if (!variant.product.isActive) {
          errors.push(`"${variant.product.nameEn}" is no longer available`);
          continue;
        }
        // Hard requirement: a variant line must reference its parent
        // product. Defensive — should be guaranteed by the FK, but
        // guards against a row that somehow has a dangling variantId
        // pointing at a deleted parent.
        if (variant.product.id !== it.productId) {
          errors.push(`Variant does not belong to product ${it.productId}`);
          continue;
        }
        const stock = variant.stockQty ?? 0;
        if (stock < it.qty) {
          errors.push(`"${variant.product.nameEn} (${variant.name})" — only ${stock} in stock`);
          continue;
        }
        const unitPrice = Number(variant.priceSale);
        const mrp = Number(variant.priceMrp);
        const lineTotal = unitPrice * it.qty;
        subtotal += lineTotal;
        priced.push({
          productId: variant.product.id,
          variantId: variant.id,
          slug: variant.product.slug,
          nameBn: variant.product.nameBn,
          nameEn: variant.product.nameEn,
          variantName: variant.name,
          unit: variant.product.unit,
          qty: it.qty,
          unitPrice,
          mrp,
          lineTotal,
          image: variant.product.images?.[0]?.url ?? null,
          inStock: true,
        });
        continue;
      }
      // Legacy single-SKU path.
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
      // Phase 1: a product that flipped to hasVariants=true can no
      // longer be purchased without a variantId — reject any legacy
      // cart lines so the user gets a clear "please re-add" error
      // instead of silently using the parent scalars.
      if (product.hasVariants) {
        errors.push(`"${product.nameEn}" now requires selecting a size/variant — please re-add`);
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
        variantId: null,
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        variantName: null,
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