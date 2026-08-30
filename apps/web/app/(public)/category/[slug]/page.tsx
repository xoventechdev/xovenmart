import { notFound } from "next/navigation";
import { apiServer } from "@/lib/api-server";
import { CategoryView } from "./category-view";
import { CategoryHeader } from "./category-header";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const cat = await apiServer.get(`/catalog/categories/${slug}`);
    const title =
      cat.nameEn || cat.nameBn || slug;
    return {
      title: `${title} — XovenMart`,
      description: cat.nameEn
        ? `All products in ${cat.nameEn} category`
        : `${cat.nameBn} ক্যাটাগরির সব পণ্য`,
    };
  } catch {
    return { title: "Category — XovenMart" };
  }
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [category, productsResp] = await Promise.all([
    apiServer.get(`/catalog/categories/${slug}`).catch(() => null),
    apiServer
      .get(`/catalog/products?category=${slug}&perPage=50`)
      .catch(() => ({ items: [], total: 0 })),
  ]);

  if (!category) notFound();
  const items = productsResp.items || [];

  return (
    <div className="container mx-auto px-4 py-6">
      <CategoryHeader slug={slug} category={category} />

      <CategoryView slug={slug} initialItems={items} />
    </div>
  );
}
