import { apiServer } from "@/lib/api-server";
import { CategoryView } from "../category/[slug]/category-view";
import { ProductsHeader } from "./products-view";

/**
 * /products — "See all" landing page from the home rail.
 *
 * Lists every active product (no category filter) sorted by sales by
 * default. Reuses the same client view as `/category/[slug]` so the
 * toolbar (sort dropdown, filter panel, active chips) and product
 * grid render identically — only the header copy + URL differ.
 *
 * Re-validated every 5 minutes via ISR, matching the cadence of the
 * category route.
 */
export const revalidate = 300;

export const metadata = {
  title: "All Products — XovenMart",
  description:
    "Browse every product available for delivery — sorted by popularity, with filters for price, stock, and deals.",
};

export default async function ProductsPage() {
  // Same query shape `/catalog/products/featured` uses, just without
  // the `featured=true` filter so the page can show non-featured
  // products too.
  const productsResp = await apiServer
    .get(`/catalog/products?perPage=50&sort=popular`)
    .catch(() => ({ items: [], total: 0 }));

  return (
    <div className="container mx-auto px-4 py-6">
      <ProductsHeader />

      {/* `slug=""` + `omitCategory` tells CategoryView to fetch every
          product on subsequent sort changes instead of scoping to a
          category. */}
      <CategoryView
        slug=""
        initialItems={(productsResp as any).items ?? []}
        omitCategory
      />
    </div>
  );
}