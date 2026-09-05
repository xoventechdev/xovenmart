import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { ListProductsQuery, SearchQuery } from "./dto";

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ════════════════════════════════════════════════════════════════

  /**
   * List categories with a **recursive** product count so callers can
   * tell at a glance whether a category has any live products — either
   * directly under it OR under any of its sub-categories. The public
   * site header uses this to drop empty branches from the nav so
   * shoppers don't click into dead-end pages.
   *
   * Strategy: fetch every active category in one query (the table is
   * small — typically <100 rows), build a parent→children map, then
   * compute the recursive count bottom-up by walking the map. This is
   * O(N) and avoids N+1.
   *
   * `rootOnly` + `includeChildren` are response-shape controls (admin
   * uses them too); the recursive count is always computed so the FE
   * can filter consistently regardless of shape.
   */
  async listCategories(opts: { includeChildren?: boolean; rootOnly?: boolean }) {
    // Single query: every active category, with its direct product count.
    // `_count.products` only counts products DIRECTLY under the category
    // — we sum this up recursively below so a parent that only has
    // products in its sub-categories still reports >0.
    const all = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { products: { where: { isActive: true } } },
        },
      },
    });

    // Index by id for O(1) lookup. Also build the parent → children map
    // (only for active sub-categories — inactive ones are already
    // filtered out at the top via `isActive: true`).
    const byId = new Map<string, any>();
    for (const c of all) byId.set(c.id, c);

    const childrenMap = new Map<string | null, any[]>();
    for (const c of all) {
      const key = c.parentId ?? null;
      if (!childrenMap.has(key)) childrenMap.set(key, []);
      childrenMap.get(key)!.push(c);
    }

    // Walk bottom-up: `recCount(c)` = direct product count of c
    // PLUS recCount of every active child. We memoize so we visit
    // each category once. Visited guard prevents infinite loops if the
    // data has a (buggy) cycle.
    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    const recCount = (id: string): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) return 0; // cycle guard
      visiting.add(id);
      const cat = byId.get(id);
      if (!cat) {
        visiting.delete(id);
        return 0;
      }
      const direct = cat._count?.products ?? 0;
      const kids = childrenMap.get(id) ?? [];
      let fromChildren = 0;
      for (const k of kids) fromChildren += recCount(k.id);
      const total = direct + fromChildren;
      visiting.delete(id);
      memo.set(id, total);
      return total;
    };

    // Project into the response shape, applying rootOnly + includeChildren
    // AFTER the counts are computed so the count is correct regardless
    // of which subset we return. `rootOnly` is applied before projection
    // (we still have the raw `parentId` here on `all`).
    const source = opts.rootOnly ? all.filter((c: any) => !c.parentId) : all;

    const result = source.map((c: any) => ({
      id: c.id,
      slug: c.slug,
      nameBn: c.nameBn,
      nameEn: c.nameEn,
      imageUrl: c.imageUrl,
      productCount: recCount(c.id),
      children: opts.includeChildren
        ? (childrenMap.get(c.id) ?? []).map((k: any) => ({
            id: k.id,
            slug: k.slug,
            nameBn: k.nameBn,
            nameEn: k.nameEn,
            imageUrl: k.imageUrl,
            productCount: recCount(k.id),
          }))
        : undefined,
    }));

    return result;
  }

  async getCategoryBySlug(slug: string) {
    const cat = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
        parent: true,
      },
    });
    if (!cat || !cat.isActive) throw new NotFoundException("Category not found");
    return cat;
  }

  // ════════════════════════════════════════════════════════════════
  // PRODUCTS
  // ════════════════════════════════════════════════════════════════

  async listProducts(q: ListProductsQuery) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 24, 100);
    const skip = (page - 1) * perPage;

    const where: any = { isActive: true };

    // Category filter (include sub-categories recursively)
    if (q.category) {
      const cat = await this.prisma.category.findUnique({
        where: { slug: q.category },
        include: { children: { select: { id: true } } },
      });
      if (cat) {
        const subIds = [cat.id, ...(cat.children?.map((c: any) => c.id) ?? [])];
        where.categoryId = { in: subIds };
      } else {
        return { items: [], page, perPage, total: 0, totalPages: 0 };
      }
    }

    if (q.featured === "true") where.isFeatured = true;

    // Search
    if (q.q && q.q.trim().length > 0) {
      const term = q.q.trim();
      where.OR = [
        { nameBn: { contains: term, mode: "insensitive" } },
        { nameEn: { contains: term, mode: "insensitive" } },
        { descriptionBn: { contains: term, mode: "insensitive" } },
        { descriptionEn: { contains: term, mode: "insensitive" } },
      ];
    }

    // Sort
    const orderBy: any = (() => {
      switch (q.sort) {
        case "price_asc": return { salePrice: "asc" };
        case "price_desc": return { salePrice: "desc" };
        case "discount": return { salePrice: "asc" }; // proxy: lower sale price vs MRP = higher discount
        case "popular":
          // Sort by order-line count desc, fall back to newest first for
          // never-ordered items so the list isn't random.
          return [
            { orderItems: { _count: "desc" } },
            { createdAt: "desc" },
          ] as any;
        case "new":
        default:
          return { createdAt: "desc" };
      }
    })();

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: perPage,
        orderBy,
        include: {
          category: { select: { id: true, slug: true, nameBn: true, nameEn: true } },
          images: { orderBy: { sortOrder: "asc" }, take: 2 },
          inventory: { select: { stockQty: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map(this.serializeProduct),
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getProductBySlug(slug: string) {
    const p = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        inventory: true,
      },
    });
    if (!p) throw new NotFoundException("Product not found");
    // IMPORTANT: We intentionally do NOT throw here for inactive products.
    // A visitor who has a saved URL or a stale search-result link shouldn't
    // hit a dead-end Next.js 404 — they should see a friendly "no longer
    // available" page that points them at the category and similar items.
    // `serializeProductDetail` includes the `isActive` flag so the public
    // web UI can detect the soft-deleted state and render the right view.
    // (Hard-deleted products, where the row is gone entirely, still 404.)
    return this.serializeProductDetail(p);
  }

  async getProductById(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true, inventory: true, category: true },
    });
    if (!p) throw new NotFoundException("Product not found");
    return this.serializeProductDetail(p);
  }

  // ════════════════════════════════════════════════════════════════
  // SEARCH (autocomplete)
  // ════════════════════════════════════════════════════════════════

  async search(q: SearchQuery) {
    const term = (q.q ?? "").trim();
    if (!term) return { results: [] };

    const items = await this.prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { nameBn: { contains: term, mode: "insensitive" } },
          { nameEn: { contains: term, mode: "insensitive" } },
        ],
      },
      take: q.limit ?? 10,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        nameBn: true,
        nameEn: true,
        salePrice: true,
        mrp: true,
        images: { take: 1, orderBy: { sortOrder: "asc" } },
      },
    });

    return {
      results: items.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        nameBn: p.nameBn,
        nameEn: p.nameEn,
        price: Number(p.salePrice),
        mrp: Number(p.mrp),
        image: p.images?.[0]?.url ?? null,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // DELIVERY ZONES
  // ════════════════════════════════════════════════════════════════

  async listDeliveryZones() {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { radiusKm: "asc" },
    });
    return zones.map((z) => ({
      id: z.id,
      nameBn: z.nameBn,
      nameEn: z.nameEn,
      centerLat: Number(z.centerLat),
      centerLng: Number(z.centerLng),
      radiusKm: Number(z.radiusKm),
      baseKm: Number(z.baseKm),
      baseFee: Number(z.baseFee),
      perKmFee: Number(z.perKmFee),
      perKgFee: Number(z.perKgFee),
      heavyKgThreshold: z.heavyKgThreshold ? Number(z.heavyKgThreshold) : null,
      heavyKgFee: z.heavyKgFee ? Number(z.heavyKgFee) : null,
      freeAbove: z.freeAbove ? Number(z.freeAbove) : null,
    }));
  }

  /**
   * Calculate delivery fee based on:
   *   1. Distance (haversine → km from zone center)
   *   2. Cart weight (sum of items × weightGrams)
   *   3. Optional free-delivery threshold (freeAbove)
   *
   * Formula per matched zone:
   *   distance_fee = base_fee + ceil(max(0, distanceKm - baseKm)) * perKmFee
   *   weight_fee   = perKgFee * weightKg
   *                  (overridden to flat heavyKgFee if weightKg > heavyKgThreshold
   *                   and both heavy fields are set)
   *   delivery_fee = distance_fee + weight_fee
   *                  (zeroed if subtotal >= freeAbove)
   *
   * Returns the smallest matching zone (highest precision). If the point
   * is outside all zones, returns outsideAllZones=true with deliveryFee=0
   * (caller should reject the order).
   */
  async calcDeliveryFee(
    lat: number,
    lng: number,
    subtotal: number,
    items?: { qty: number; weightGrams?: number }[],
  ) {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { radiusKm: "asc" }],
    });

    // Compute cart weight in kg. Default to 1 kg if no items provided
    // (so unknown-weight orders still get a sensible fee). Per-item default
    // of 1000g (1 kg) if weightGrams is missing.
    const weightKg = items && items.length > 0
      ? items.reduce((s, it) => s + ((it.weightGrams ?? 1000) * it.qty) / 1000, 0)
      : 1;

    let nearestKm = Infinity;

    for (const z of zones) {
      const d = haversineKm(lat, lng, Number(z.centerLat), Number(z.centerLng));
      if (d < nearestKm) nearestKm = d;
      if (d > Number(z.radiusKm)) continue;

      // Distance-based fee
      const baseKm = Number(z.baseKm);
      const baseFee = Number(z.baseFee);
      const perKmFee = Number(z.perKmFee);
      const extraKm = Math.max(0, Math.ceil(d - baseKm));
      const distanceFee = baseFee + extraKm * perKmFee;

      // Weight-based fee
      const perKgFee = Number(z.perKgFee);
      let weightFee = weightKg * perKgFee;
      const heavyThreshold = z.heavyKgThreshold ? Number(z.heavyKgThreshold) : null;
      const heavyFee = z.heavyKgFee ? Number(z.heavyKgFee) : null;
      if (heavyThreshold !== null && heavyFee !== null && weightKg > heavyThreshold) {
        // Heavy override: charge a flat heavy fee instead of per-kg × heavy weight
        weightFee = heavyFee;
      }

      const subtotalFee = distanceFee + weightFee;
      const freeAbove = z.freeAbove ? Number(z.freeAbove) : null;
      const inFreeRange = freeAbove !== null && subtotal >= freeAbove;
      const deliveryFee = inFreeRange ? 0 : Math.round(subtotalFee);

      return {
        zoneId: z.id,
        zoneNameEn: z.nameEn,
        zoneNameBn: z.nameBn,
        distanceKm: round(d, 2),
        weightKg: round(weightKg, 2),
        baseKm,
        baseFee,
        perKmFee,
        perKgFee,
        heavyKgThreshold: heavyThreshold,
        heavyKgFee: heavyFee,
        deliveryFee,
        freeAbove,
        freeDeliveryApplied: inFreeRange,
        breakdown: {
          distanceFee: Math.round(distanceFee),
          weightFee: Math.round(weightFee),
          extraKm,
        },
      };
    }

    // Outside all zones — caller should reject the order
    if (zones.length === 0) {
      // No zones configured at all — refuse to ship
      return {
        zoneId: null,
        deliveryFee: 0,
        freeAbove: null,
        freeDeliveryApplied: false,
        outsideAllZones: true,
        distanceKm: null,
        weightKg: round(weightKg, 2),
        message: "এই এলাকায় ডেলিভারি সম্ভব নয় (কোনো জোন কনফিগার করা নেই)",
      };
    }

    return {
      zoneId: null,
      deliveryFee: 0,
      freeAbove: null,
      freeDeliveryApplied: false,
      outsideAllZones: true,
      distanceKm: round(nearestKm, 2),
      weightKg: round(weightKg, 2),
      message: "এই এলাকায় ডেলিভারি সম্ভব নয়",
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Serializers
  // ════════════════════════════════════════════════════════════════

  private serializeProduct = (p: any) => {
    const mrp = Number(p.mrp);
    const sale = Number(p.salePrice);
    const discountPct = mrp > 0 ? Math.round(((mrp - sale) / mrp) * 100) : 0;
    return {
      id: p.id,
      slug: p.slug,
      nameBn: p.nameBn,
      nameEn: p.nameEn,
      unit: p.unit,
      // Include weightGrams on list/card views too so cart items added
      // from any source (home / category / search / deal) keep the value
      // for delivery-fee calculation. Missing weights fall back to 1000g
      // on the server (calcDeliveryFee + checkout.service).
      weightGrams: p.weightGrams ?? null,
      mrp,
      salePrice: sale,
      discountPct,
      isFeatured: p.isFeatured,
      isNew: p.isNew,
      category: p.category,
      image: p.images?.[0]?.url ?? null,
      inStock: (p.inventory?.stockQty ?? 0) > 0,
    };
  };

  private serializeProductDetail = (p: any) => {
    const base = this.serializeProduct(p);
    return {
      ...base,
      descriptionBn: p.descriptionBn,
      descriptionEn: p.descriptionEn,
      weightGrams: p.weightGrams,
      images: p.images.map((im: any) => ({ url: im.url, altBn: im.altBn, altEn: im.altEn })),
      // Public-facing product detail must NOT expose exact stock counts —
      // competitors / shoppers can use that to time purchases.
      // Only `inStock` (boolean) is exposed; admin sees full stockQty.
      inStock: (p.inventory?.stockQty ?? 0) > 0,
      // Expose the active flag so the storefront can render a soft "no
      // longer available" page for deactivated products instead of a
      // dead-end 404 (see getProductBySlug comment for rationale).
      isActive: p.isActive,
    };
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}