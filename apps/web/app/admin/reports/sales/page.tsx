"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, DollarSign, Package, Download, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface SalesRow {
  date: string;
  orders: number;
  revenue: number;
  itemsSold: number;
}

const exportCsv = (rows: SalesRow[], filename: string) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function SalesReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [days, setDays] = useState<number>(30);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "reports", "sales", days],
    queryFn: () => api.get<SalesRow[]>(`/admin/reports/sales?days=${days}`),
  });

  const list: SalesRow[] = (rows ?? []) as any;
  const totalOrders = list.reduce((s, r) => s + r.orders, 0);
  const totalRevenue = list.reduce((s, r) => s + r.revenue, 0);
  const totalItems = list.reduce((s, r) => s + r.itemsSold, 0);
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("বিক্রয় রিপোর্ট", "Sales Report")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("দৈনিক বিক্রয়ের পরিসংখ্যান", "Daily sales statistics")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-ink-200 dark:border-ink-300">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={
                  "px-3 py-1.5 text-xs font-medium transition-colors " +
                  (days === d
                    ? "bg-primary-700 text-white"
                    : "bg-white text-ink-700 hover:bg-ink-50 dark:bg-ink-50 dark:text-ink-900")
                }
              >
                {d} {t("দিন", "days")}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => exportCsv(list, `sales-${days}d.csv`)}>
            <Download className="h-4 w-4" /> {t("CSV রপ্তানি", "Export CSV")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<BarChart3 className="h-4 w-4" />}
          label={t("মোট অর্ডার", "Total orders")}
          value={totalOrders.toLocaleString()}
          tone="primary"
        />
        <SummaryCard
          icon={<DollarSign className="h-4 w-4" />}
          label={t("মোট আয়", "Total revenue")}
          value={`৳${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          tone="success"
        />
        <SummaryCard
          icon={<TrendingUp className="h-4 w-4" />}
          label={t("গড় অর্ডার ম�ল্য", "AOV")}
          value={`৳${aov.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          tone="info"
        />
        <SummaryCard
          icon={<Package className="h-4 w-4" />}
          label={t("বিক্রীত পণ্য", "Items sold")}
          value={totalItems.toLocaleString()}
          tone="warning"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("দৈনিক বিক্রয়", "Daily sales")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন তথ্য নে�", "No data")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                <tr>
                  <th className="h-11 px-4 text-left">{t("তারিখ", "Date")}</th>
                  <th className="h-11 px-4 text-right">{t("অর্ডার", "Orders")}</th>
                  <th className="h-11 px-4 text-right">{t("আয়", "Revenue")}</th>
                  <th className="h-11 px-4 text-right">{t("পণ্য", "Items sold")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.date} className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Calendar className="mr-1 inline h-3 w-3 text-ink-400" />
                      {r.date}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant="muted">{r.orders}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">৳{r.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{r.itemsSold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "success" | "info" | "warning";
}) {
  const colors: Record<string, string> = {
    primary: "bg-primary-100 text-primary-700",
    success: "bg-success-100 text-success-700",
    info: "bg-info-100 text-info-700",
    warning: "bg-warning-100 text-warning-700",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={"flex h-9 w-9 items-center justify-center rounded " + colors[tone]}>{icon}</div>
          <div>
            <div className="text-xs text-ink-500">{label}</div>
            <div className="text-lg font-bold text-ink-900 dark:text-ink-900">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
