"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  RotateCcw,
  Search,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface StockMovement {
  id: string;
  productId: string;
  sku: string;
  nameEn: string;
  nameBn: string;
  delta: number;
  reason: "PURCHASE" | "SALE" | "ADJUSTMENT" | "RETURN" | "DAMAGE" | "EXPIRED";
  refOrderId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface ProductLite {
  id: string;
  sku: string;
  nameEn: string;
  nameBn: string;
}

const REASON_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "muted"> = {
  PURCHASE: "success",
  SALE: "muted",
  ADJUSTMENT: "default",
  RETURN: "warning",
  DAMAGE: "danger",
  EXPIRED: "danger",
};

export default function MovementsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");

  const params = new URLSearchParams();
  params.set("perPage", "100");
  if (productId) params.set("productId", productId);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin", "inventory", "movements", productId],
    queryFn: () => api.get<{ items: StockMovement[]; total: number }>(`/admin/inventory/movements?${params.toString()}`),
  });

  const { data: productsData } = useQuery({
    queryKey: ["admin", "products", "all-for-movements"],
    queryFn: () => api.get<{ items: ProductLite[] }>("/admin/products?perPage=200"),
  });
  const products: ProductLite[] = (productsData?.items ?? []) as any;

  const items: StockMovement[] = (data?.items ?? []) as any;

  const filtered = items.filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      it.nameEn.toLowerCase().includes(q) ||
      it.nameBn.toLowerCase().includes(q) ||
      it.sku.toLowerCase().includes(q) ||
      it.reason.toLowerCase().includes(q) ||
      (it.note ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("স্টক মুভমেন্ট", "Stock Movements")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("সব স্টক ইন/আউট মুভমেন্ট দেখুন", "View all stock in/out movements")}</p>
        </div>
        <Link href="/admin/inventory">
          <Button variant="outline">
            <TrendingUp className="h-4 w-4" /> {t("ইনভেন্টরি", "Inventory")}
          </Button>
        </Link>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("পণ্য, কারণ বা নোট খুঁজুন...", "Search product, reason, or note...")}
                className="pl-8"
              />
            </div>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="">{t("— সব পণ্য —", "— All products —")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {lang === "bn" ? p.nameBn : p.nameEn}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> {t("রিফ্রেশ", "Refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("মুভমেন্ট ইতিহাস", "Movement history")} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন মুভমেন্ট নেই", "No movements yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("তারিখ", "Date")}</th>
                    <th className="px-3 py-2 text-left">{t("পণ্য", "Product")}</th>
                    <th className="px-3 py-2 text-right">{t("পরিবর্তন", "Delta")}</th>
                    <th className="px-3 py-2 text-left">{t("কারণ", "Reason")}</th>
                    <th className="px-3 py-2 text-left">{t("নোট", "Note")}</th>
                    <th className="px-3 py-2 text-left">{t("দ্বারা", "By")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const isPositive = m.delta > 0;
                    return (
                      <tr key={m.id} className="border-t border-ink-200 dark:border-ink-300 hover:bg-ink-50 dark:hover:bg-ink-100">
                        <td className="px-3 py-2 text-xs text-ink-500">{formatDate(m.createdAt, lang)}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{lang === "bn" ? m.nameBn : m.nameEn}</div>
                          <div className="font-mono text-[10px] text-ink-500">{m.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <DeltaBadge delta={m.delta} />
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={REASON_VARIANT[m.reason] ?? "muted"}>{m.reason}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-700 dark:text-ink-900 max-w-[280px] truncate" title={m.note ?? ""}>
                          {m.note || <span className="text-ink-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-ink-500">
                          {m.createdBy ? m.createdBy.slice(-6) : <span className="text-ink-400">system</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-success-100 px-2 py-0.5 text-xs font-semibold text-success-700 dark:bg-success-500/20 dark:text-success-100">
        <TrendingUp className="h-3 w-3" /> +{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-danger-100 px-2 py-0.5 text-xs font-semibold text-danger-700 dark:bg-danger-500/20 dark:text-danger-100">
        <TrendingDown className="h-3 w-3" /> {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700 dark:bg-ink-200 dark:text-ink-900">
      <RotateCcw className="h-3 w-3" /> 0
    </span>
  );
}

function formatDate(s: string, lang: "bn" | "en") {
  try {
    const d = new Date(s);
    return d.toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
}