import { apiServer } from "@/lib/api-server";
import { HomeView } from "./home-view";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export default async function HomePage() {
  // Fetch data in parallel (server-side, language-agnostic). Categories
  // are no longer fetched here — `SiteCategoryNav` in the header owns
  // that data and fetches it client-side via React Query, so the home
  // page doesn't need to round-trip the categories endpoint.
  const [featured, banners] = await Promise.all([
    apiServer.get("/catalog/products/featured").catch(() => ({ items: [] })),
    apiServer.get("/banners/public").catch(() => []),
  ]);

  return (
    <HomeView
      featured={(featured as any).items ?? []}
      banners={Array.isArray(banners) ? (banners as any) : []}
    />
  );
}
