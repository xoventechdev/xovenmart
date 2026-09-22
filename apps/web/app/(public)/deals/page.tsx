import { apiServer } from "@/lib/api-server";


// Force dynamic rendering so Next 15 doesn't pre-render this page
// during `next build`. The underlying view uses client hooks
// (useDeliveryPublic / useGeneralSettings) that fetch from the api
// at localhost:3001 — there's no api at build time, so each hook
// blocks until the 60s connect timeout and Next aborts the export.
export const dynamic = 'force-dynamic';
import { DealsView } from "./deals-view";

export const revalidate = 300;

export const metadata = {
  title: "Deals & discounts — XovenMart",
};

export default async function DealsPage() {
  const products = await apiServer
    .get(`/catalog/products?perPage=50&sort=discount`)
    .catch(() => ({ items: [] }));

  const dealItems = (products.items || []).filter(
    (p: any) => p.discountPct && p.discountPct > 0
  );

  return <DealsView items={dealItems} />;
}
