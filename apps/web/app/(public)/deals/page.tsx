import { apiServer } from "@/lib/api-server";
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