import { notFound } from "next/navigation";
import { apiServer } from "@/lib/api-server";
import { ProductView, ProductBreadcrumb } from "./product-view";
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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await apiServer
    .get(`/catalog/products/${slug}`)
    .catch(() => null);

  if (!product) notFound();

  return (
    <div className="container mx-auto px-4 py-6">
      <ProductBreadcrumb product={product} />
      <ProductView product={product} />
    </div>
  );
}