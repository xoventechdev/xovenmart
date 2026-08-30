import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "./catalog.service";
import { ListCategoriesQuery, ListProductsQuery, SearchQuery } from "./dto";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // ─── Categories ────────────────────────────────────────────────

  @Get("categories")
  @ApiOperation({ summary: "List all active categories. Pass includeChildren=true to get sub-categories." })
  listCategories(@Query() q: ListCategoriesQuery) {
    return this.catalog.listCategories({
      includeChildren: q.includeChildren === "true",
      rootOnly: q.rootOnly === "true",
    });
  }

  @Get("categories/:slug")
  @ApiOperation({ summary: "Get category by slug with its sub-categories and parent" })
  getCategory(@Param("slug") slug: string) {
    return this.catalog.getCategoryBySlug(slug);
  }

  // ─── Products ──────────────────────────────────────────────────

  @Get("products")
  @ApiOperation({ summary: "List active products with filters & pagination" })
  listProducts(@Query() q: ListProductsQuery) {
    return this.catalog.listProducts(q);
  }

  @Get("products/featured")
  @ApiOperation({ summary: "Featured products for home page carousel" })
  featured() {
    return this.catalog.listProducts({ featured: "true", perPage: 12 } as any);
  }

  @Get("products/:slug")
  @ApiOperation({ summary: "Get product detail by slug" })
  productBySlug(@Param("slug") slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  // ─── Search ────────────────────────────────────────────────────

  @Get("search")
  @ApiOperation({ summary: "Search autocomplete" })
  search(@Query() q: SearchQuery) {
    return this.catalog.search(q);
  }

  // ─── Delivery zones ────────────────────────────────────────────

  @Get("delivery-zones")
  @ApiOperation({ summary: "List delivery zones (for display in footer / checkout info)" })
  deliveryZones() {
    return this.catalog.listDeliveryZones();
  }

  @Get("delivery-fee")
  @ApiOperation({
    summary:
      "Calculate delivery fee for a lat/lng + subtotal + optional cart items[] for weight surcharge. Returns { zoneId, distanceKm, weightKg, baseFee, perKmFee, perKgFee, deliveryFee, freeAbove, freeDeliveryApplied, breakdown, outsideAllZones? }",
  })
  async calcFee(
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("subtotal") subtotal: string,
    @Query("items") itemsJson?: string,
  ) {
    const latN = Number(lat);
    const lngN = Number(lng);
    const subN = Number(subtotal ?? "0");
    if (!isFinite(latN) || !isFinite(lngN)) {
      return { error: "Invalid lat/lng" };
    }
    let items: { qty: number; weightGrams?: number }[] | undefined;
    if (itemsJson && itemsJson.length > 0) {
      try {
        const parsed = JSON.parse(itemsJson);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        return { error: "Invalid items JSON" };
      }
    }
    return this.catalog.calcDeliveryFee(latN, lngN, subN, items);
  }
}