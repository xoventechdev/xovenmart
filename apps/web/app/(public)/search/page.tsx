import { apiServer } from "@/lib/api-server";
import { SearchView } from "./search-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  return {
    title: q ? `Search "${q}" — XovenMart` : "Search — XovenMart",
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";

  const results = q
    ? await apiServer
        .get(`/catalog/search?q=${encodeURIComponent(q)}`)
        .catch(() => ({ items: [] }))
    : { items: [] };

  const items = results.items || [];

  return <SearchView q={q} items={items} />;
}