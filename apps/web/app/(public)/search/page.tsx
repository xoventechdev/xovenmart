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
        .catch(() => ({ results: [] }))
    : { results: [] };

  // `/catalog/search` returns `{ results: [...] }` (autocomplete-shaped).
  // Accept `items` too so future callers / variants stay compatible.
  const raw = ((results as any).results ?? (results as any).items ?? []) as any[];

  // Normalize shape: the autocomplete endpoint returns `price`, but
  // `ProductCard` (used everywhere else in the storefront) reads
  // `salePrice`. Alias `price → salePrice` so the same card component
  // works here without a fork.
  const items = raw.map((p: any) => ({
    ...p,
    salePrice: p.salePrice ?? p.price,
  }));

  return <SearchView q={q} items={items} />;
}