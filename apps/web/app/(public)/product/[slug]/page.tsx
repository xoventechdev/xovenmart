import { notFound } from "next/navigation";
import { apiServer } from "@/lib/api-server";
import { ProductView, ProductBreadcrumb } from "./product-view";
import { ProductUnavailable } from "./product-unavailable";
import { pickName } from "@/lib/locale-text";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const p = await apiServer.get(`/catalog/products/${slug}`);
    const title = p.nameEn || p.nameBn || slug;
    return {
      title: `${title} — XovenMart`,
      description: p.descriptionEn || p.descriptionBn || "",
    };
  } catch {
    return { title: "Product — XovenMart" };
  }
}

/**
 * Three render branches for /product/[slug]:
 *   1. Hard 404 (product row doesn't exist at all) — Next notFound()
 *   2. Soft "no longer available" — product exists but isActive === false
 *      (admin deactivated it, but kept the row). We render a friendly
 *      fallback page with related products from the same category instead
 *      of sending the visitor to a dead-end 404 page.
 *   3. Normal product detail page.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // apiServer.get() returns {} on a 404 (it swallows the error), so we
  // detect the not-found case by checking for a missing id/slug rather
  // than truthiness. Both fields are always populated for real products.
  const product = await apiServer.get(`/catalog/products/${slug}`);

  if (!product || !product.id || !product.slug) {
    notFound();
  }

  // Branch 2 — deactivated product with a saved URL. Render the friendly
  // "no longer available" view so the visitor can recover by browsing
  // the category or finding similar items.
  if (product.isActive === false) {
    return <ProductUnavailable product={product} />;
  }

  // Branch 3 — active product.
  return (
    <div className="container mx-auto px-4 py-6">
      <ProductBreadcrumb product={product} />
      <ProductView product={product} />
    </div>
  );
}