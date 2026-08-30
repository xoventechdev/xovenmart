"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface LowStockRow {
  productId: string;
  sku: string;
  nameEn: string;
  nameBn: string;
  category: string | null;
  stockQty: number;
  lowStockThreshold: number;
  reorderQty: number;
  salePrice: number;
}

const exportCsv = (rows: LowStockRow[], filename: string) => {
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

export default function LowStockReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "reports", "low-stock"],
    queryFn: () => api.get<LowStockRow[]>("/admin/reports/low-stock"),
  });

  const list: LowStockRow[] = (rows ?? []) as any;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("কম স্টক রিপোর্ট", "Low Stock Report")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("পুনরায় অর্ডার করার পরামর্শ সহ", "With reorder suggestions")}</p>
        </div>
        <Button variant="outline" onClick={() => exportCsv(list, "low-stock.csv")}>
          <Download className="h-4 w-4" /> {t("CSV রপ্তানি", "Export CSV")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <AlertTriangle className="mr-2 inline h-4 w-4 text-warning-700" />
            {t("কম স্টক পণ্য", "Low-stock products")} ({list.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("সব পণ্যের পর্যাপ্ত স্�ক আছে", "All products have sufficient stock")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                <tr>
                  <th className="h-10 px-4 text-left">{t("পণ্য", "Product")}</th>
                  <th className="h-10 px-4 text-left">SKU</th>
                  <th className="h-10 px-4 text-left">{t("ক্যাটাগরি", "Category")}</th>
                  <th className="h-10 px-4 text-right">{t("বর্তমান", "Stock")}</th>
                  <th className="h-10 px-4 text-right">{t("সীমা", "Threshold")}</th>
                  <th className="h-10 px-4 text-right">{t("পুনরায় অর্ডার", "Reorder")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.productId} className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-ink-400" />
                        <span>{lang === "bn" ? r.nameBn : r.nameEn}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-500">{r.sku}</td>
                    <td className="px-4 py-2 text-xs">{r.category ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={r.stockQty === 0 ? "danger" : "warning"}>{r.stockQty}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-ink-500">{r.lowStockThreshold}</td>
                    <td className="px-4 py-2 text-right font-semibold">{r.reorderQty}</td>
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
