import { apiServer } from "@/lib/api-server";
import { HomeView } from "./home-view";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export default async function HomePage() {
  // Fetch data in parallel (server-side, language-agnostic)
  const [featured, categories, banners] = await Promise.all([
    apiServer.get("/catalog/products/featured").catch(() => ({ items: [] })),
    apiServer.get("/catalog/categories").catch(() => []),
    apiServer.get("/banners/public").catch(() => []),
  ]);

  return (
    <HomeView
      featured={(featured as any).items ?? []}
      categories={Array.isArray(categories) ? (categories as any) : []}
      banners={Array.isArray(banners) ? (banners as any) : []}
    />
  );
}
