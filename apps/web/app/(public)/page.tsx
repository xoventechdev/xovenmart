import { apiServer } from "@/lib/api-server";
import { HomeView } from "./home-view";

// Force dynamic rendering: apiServer short-circuits to `{}` during
// `next build` (no api running in the build container), so an ISR
// pre-render pass would emit a permanently-empty homepage. Render
// on-demand at request time instead.
export const dynamic = "force-dynamic";

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
