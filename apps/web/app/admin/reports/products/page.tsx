"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface TopProduct {
  productId: string;
  nameEn: string;
  nameBn: string;
  sku: string;
  qtySold: number;
  revenue: number;
}

interface SlowProduct {
  productId: string;
  nameEn: string;
  nameBn: string;
  sku: string;
  lastSoldAt: string | null;
  stockQty: number;
}

interface InventoryValue {
  totalCost: number;
  totalSale: number;
  potentialProfit: number;
  totalUnits: number;
  items: {
    productId: string;
    sku: string;
    nameEn: string;
    nameBn: string;
    stockQty: number;
    costValue: number;
    saleValue: number;
  }[];
}

type Tab = "top" | "slow" | "value";

export default function ProductsReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [tab, setTab] = useState<Tab>("top");

  const { data: top } = useQuery({
    queryKey: ["admin", "reports", "products", "top-selling"],
    queryFn: () => api.get<TopProduct[]>("/admin/reports/products/top-selling?days=30"),
    enabled: tab === "top",
  });
  const { data: slow } = useQuery({
    queryKey: ["admin", "reports", "products", "slow-moving"],
    queryFn: () => api.get<SlowProduct[]>("/admin/reports/products/slow-moving?days=60"),
    enabled: tab === "slow",
  });
  const { data: value } = useQuery({
    queryKey: ["admin", "reports", "products", "inventory-value"],
    queryFn: () => api.get<InventoryValue>("/admin/reports/products/inventory-value"),
    enabled: tab === "value",
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("পণ্য রিপোর্ট", "Products Report")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("বিভিন্ন পণ্য বিশ্লেষণ", "Product analytics")}</p>
      </div>

      <div className="inline-flex overflow-hidden rounded-md border border-ink-200 dark:border-ink-300">
        {[
          { id: "top", labelBn: "সর্বাধিক বিক্রীত", labelEn: "Top Selling" },
          { id: "slow", labelBn: "ধীর গতির", labelEn: "Slow Moving" },
          { id: "value", labelBn: "ইনভেন্টরি মূল্য", labelEn: "Inventory Value" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTab(opt.id as Tab)}
            className={
              "px-4 py-2 text-sm font-medium transition-colors " +
              (tab === opt.id ? "bg-primary-700 text-white" : "bg-white text-ink-700 hover:bg-ink-50 dark:bg-ink-50 dark:text-ink-900")
            }
          >
            {t(opt.labelBn, opt.labelEn)}
          </button>
        ))}
      </div>

      {tab === "top" && <TopSellingTable rows={(top ?? []) as TopProduct[]} />}
      {tab === "slow" && <SlowMovingTable rows={(slow ?? []) as SlowProduct[]} />}
      {tab === "value" && value && <InventoryValueView data={value as InventoryValue} />}
    </div>
  );
}

function TopSellingTable({ rows }: { rows: TopProduct[] }) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TrendingUp className="mr-2 inline h-4 w-4" />
          {t("গত ৩০ দিনে সর্বাধিক বিক্রীত", "Top selling (last 30 days)")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">{t("কোন তথ্য নেই", "No data")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
              <tr>
                <th className="h-10 px-4 text-left">#</th>
                <th className="h-10 px-4 text-left">{t("পণ্য", "Product")}</th>
                <th className="h-10 px-4 text-left">SKU</th>
                <th className="h-10 px-4 text-right">{t("বিক্রীত পরিমাণ", "Qty sold")}</th>
                <th className="h-10 px-4 text-right">{t("আয়", "Revenue")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.productId} className="border-b border-ink-200 dark:border-ink-300">
                  <td className="px-4 py-2 text-ink-500">{i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-ink-400" />
                      <span>{lang === "bn" ? r.nameBn : r.nameEn}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-500">{r.sku}</td>
                  <td className="px-4 py-2 text-right"><Badge variant="success">{r.qtySold}</Badge></td>
                  <td className="px-4 py-2 text-right font-semibold">৳{r.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function SlowMovingTable({ rows }: { rows: SlowProduct[] }) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <AlertTriangle className="mr-2 inline h-4 w-4 text-warning-700" />
          {t("গত ৬০ দিনে কোন বিক্রয় নেই", "No sales in last 60 days")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">{t("সব পণ্য বিক্রি হচ্ছে", "All products are selling")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
              <tr>
                <th className="h-10 px-4 text-left">{t("পণ্য", "Product")}</th>
                <th className="h-10 px-4 text-left">SKU</th>
                <th className="h-10 px-4 text-left">{t("শেষ বিক্রয়", "Last sold")}</th>
                <th className="h-10 px-4 text-right">{t("স্টক", "Stock")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-b border-ink-200 dark:border-ink-300">
                  <td className="px-4 py-2">{lang === "bn" ? r.nameBn : r.nameEn}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-500">{r.sku}</td>
                  <td className="px-4 py-2 text-xs">
                    {r.lastSoldAt ? new Date(r.lastSoldAt).toLocaleDateString() : <Badge variant="warning">{t("ক�নো না", "Never")}</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right"><Badge variant="muted">{r.stockQty}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryValueView({ data }: { data: InventoryValue }) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<DollarSign className="h-4 w-4" />} label={t("ক্রয়মূল্য", "Cost value")} value={`৳${data.totalCost.toFixed(2)}`} />
        <Stat icon={<DollarSign className="h-4 w-4" />} label={t("বিক্রয়মূল্য", "Sale value")} value={`৳${data.totalSale.toFixed(2)}`} />
        <Stat icon={<TrendingUp className="h-4 w-4" />} label={t("সম্ভাব্য লাভ", "Potential profit")} value={`৳${data.potentialProfit.toFixed(2)}`} />
        <Stat icon={<Package className="h-4 w-4" />} label={t("মোট ইউনিট", "Total units")} value={data.totalUnits.toLocaleString()} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("পণ্য অনুযায়ী ইনভেন্টরি মূল্য", "Inventory value by product")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
              <tr>
                <th className="h-10 px-4 text-left">{t("পণ্য", "Product")}</th>
                <th className="h-10 px-4 text-left">SKU</th>
                <th className="h-10 px-4 text-right">{t("স্�ক", "Stock")}</th>
                <th className="h-10 px-4 text-right">{t("ক্রয়মূল্য", "Cost")}</th>
                <th className="h-10 px-4 text-right">{t("বিক্রয়মূল্য", "Sale")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.productId} className="border-b border-ink-200 dark:border-ink-300">
                  <td className="px-4 py-2">{lang === "bn" ? it.nameBn : it.nameEn}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-500">{it.sku}</td>
                  <td className="px-4 py-2 text-right">{it.stockQty}</td>
                  <td className="px-4 py-2 text-right">৳{it.costValue.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-semibold">৳{it.saleValue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700">{icon}</div>
          <div>
            <div className="text-xs text-ink-500">{label}</div>
            <div className="text-lg font-bold text-ink-900 dark:text-ink-900">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
