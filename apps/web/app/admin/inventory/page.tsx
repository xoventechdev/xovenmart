"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Save,
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
import { toast } from "sonner";

interface InventoryItem {
  id: string;
  productId: string;
  sku: string;
  slug: string;
  nameEn: string;
  nameBn: string;
  stockQty: number;
  reservedQty: number;
  lowStockThreshold: number;
  updatedAt: string;
}

interface ProductLite {
  id: string;
  sku: string;
  nameEn: string;
  nameBn: string;
}

type FilterMode = "all" | "low" | "out";

const REASONS = ["PURCHASE", "SALE", "ADJUSTMENT", "RETURN", "DAMAGE", "EXPIRED"] as const;

export default function InventoryPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin", "inventory", "list"],
    queryFn: () => api.get<{ items: InventoryItem[]; total: number; page: number; perPage: number }>("/admin/inventory?perPage=200"),
  });

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["admin", "inventory", "summary"],
    queryFn: () => api.get<{ total: number; lowStock: number; outOfStock: number; totalValue: number }>("/admin/inventory/summary"),
  });

  const items: InventoryItem[] = (data?.items ?? []) as any;

  const filtered = items.filter((it) => {
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      it.nameEn.toLowerCase().includes(q) ||
      it.nameBn.toLowerCase().includes(q) ||
      it.sku.toLowerCase().includes(q);
    const isOut = it.stockQty <= 0;
    const isLow = it.stockQty <= it.lowStockThreshold;
    if (filter === "low") return matchesQ && isLow;
    if (filter === "out") return matchesQ && isOut;
    return matchesQ;
  });

  const refresh = () => {
    refetch();
    refetchSummary();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("ইনভেন্টরি", "Inventory")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("স্টক লেভেল, মুভমেন্ট ও অ্যাডজাস্টমেন্ট পরিচালনা করুন", "Manage stock levels, movements, and adjustments")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory/movements">
            <Button variant="outline">
              <TrendingUp className="h-4 w-4" /> {t("মুভমেন্ট", "Movements")}
            </Button>
          </Link>
          <Link href="/admin/inventory/low-stock">
            <Button variant="outline">
              <AlertTriangle className="h-4 w-4" /> {t("কম স্টক", "Low Stock")}
            </Button>
          </Link>
          <Button onClick={() => setAdjustOpen(true)}>
            <Plus className="h-4 w-4" /> {t("স্টক অ্যাডজাস্ট", "Adjust Stock")}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label={t("মোট পণ্য", "Total products")}
          value={String(summary?.total ?? data?.total ?? items.length)}
          tone="primary"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label={t("কম স্টক", "Low stock")}
          value={String(summary?.lowStock ?? items.filter((it) => it.stockQty <= it.lowStockThreshold && it.stockQty > 0).length)}
          tone="warning"
        />
        <StatCard
          icon={<TrendingDown className="h-5 w-5" />}
          label={t("স্টক আউট", "Out of stock")}
          value={String(summary?.outOfStock ?? items.filter((it) => it.stockQty <= 0).length)}
          tone="danger"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label={t("মোট মূল্য", "Total value")}
          value={`৳ ${Number(summary?.totalValue ?? 0).toLocaleString()}`}
          tone="success"
        />
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
                placeholder={t("পণ্যের নাম বা SKU খুঁজুন...", "Search product name or SKU...")}
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-1 rounded-md border border-ink-200 bg-white p-0.5 dark:border-ink-300 dark:bg-ink-50">
              <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
                {t("সব", "All")}
              </FilterPill>
              <FilterPill active={filter === "low"} onClick={() => setFilter("low")}>
                {t("কম স্টক", "Low")}
              </FilterPill>
              <FilterPill active={filter === "out"} onClick={() => setFilter("out")}>
                {t("আউট অফ স্টক", "Out")}
              </FilterPill>
            </div>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="h-4 w-4" /> {t("রিফ্রেশ", "Refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("স্টক লেভেল", "Stock levels")} ({filtered.length})
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
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন পণ্য নেই", "No products")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("SKU", "SKU")}</th>
                    <th className="px-3 py-2 text-left">{t("পণ্য", "Product")}</th>
                    <th className="px-3 py-2 text-right">{t("স্টক", "Stock")}</th>
                    <th className="px-3 py-2 text-right">{t("রিজার্ভড", "Reserved")}</th>
                    <th className="px-3 py-2 text-right">{t("থ্রেশহোল্ড", "Threshold")}</th>
                    <th className="px-3 py-2 text-left">{t("অবস্থা", "Status")}</th>
                    <th className="px-3 py-2 text-left">{t("আপডেট", "Updated")}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const status = stockStatus(it);
                    return (
                      <tr key={it.id} className="border-t border-ink-200 dark:border-ink-300 hover:bg-ink-50 dark:hover:bg-ink-100">
                        <td className="px-3 py-2 font-mono text-xs text-ink-700 dark:text-ink-900">{it.sku}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{lang === "bn" ? it.nameBn : it.nameEn}</div>
                          <div className="text-xs text-ink-500">/{it.slug}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{it.stockQty}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-500">{it.reservedQty}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-500">{it.lowStockThreshold}</td>
                        <td className="px-3 py-2">
                          <Badge variant={status.variant}>{t(status.bn, status.en)}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-500">{formatDate(it.updatedAt, lang)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setAdjustOpen(true)}>
                            <Plus className="h-3 w-3" /> {t("অ্যাডজাস্ট", "Adjust")}
                          </Button>
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

      {adjustOpen && (
        <AdjustStockModal
          onClose={() => setAdjustOpen(false)}
          onSaved={() => {
            setAdjustOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function stockStatus(it: InventoryItem) {
  if (it.stockQty <= 0) return { variant: "danger" as const, bn: "স্টক আউট", en: "Out of stock" };
  if (it.stockQty <= it.lowStockThreshold) return { variant: "warning" as const, bn: "কম স্টক", en: "Low stock" };
  return { variant: "success" as const, bn: "ঠিক আছে", en: "OK" };
}

function formatDate(s: string, lang: "bn" | "en") {
  try {
    const d = new Date(s);
    return d.toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary" | "warning" | "danger" | "success" }) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100",
    warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
    success: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-100",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClasses[tone]}`}>{icon}</div>
          <div>
            <div className="text-xs uppercase text-ink-500">{label}</div>
            <div className="text-xl font-bold text-ink-900 dark:text-ink-900">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded px-3 py-1 text-xs font-medium bg-primary-700 text-white"
          : "rounded px-3 py-1 text-xs font-medium text-ink-700 dark:text-ink-900 hover:bg-ink-100 dark:hover:bg-ink-200"
      }
    >
      {children}
    </button>
  );
}

function AdjustStockModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState<number>(0);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("ADJUSTMENT");
  const [note, setNote] = useState("");

  const { data: productsData } = useQuery({
    queryKey: ["admin", "products", "all-for-adjust"],
    queryFn: () => api.get<{ items: ProductLite[] }>("/admin/products?perPage=200"),
  });
  const products: ProductLite[] = (productsData?.items ?? []) as any;

  const save = useMutation({
    mutationFn: () => api.post("/admin/inventory/adjust", { productId, delta: Number(delta), reason, note: note || undefined }),
    onSuccess: () => {
      toast.success(t("স্টক আপডেট হয়েছে", "Stock updated"));
      qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
      onSaved();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("আপডেট ব্যর্থ", "Update failed")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">{t("স্টক অ্যাডজাস্ট", "Adjust Stock")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("পণ্য", "Product")}>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="">{t("— পণ্য নির্বাচন করুন —", "— Select product —")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {lang === "bn" ? p.nameBn : p.nameEn}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("পরিবর্তন (±)", "Delta (±)")} hint={t("পজিটিভ মান স্টক বাড়ায়, নেগেটিভ কমায়", "Positive adds stock, negative removes")}>
              <Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
            </Field>
            <Field label={t("কারণ", "Reason")}>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as any)}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("নোট (ঐচ্ছিক)", "Note (optional)")}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !productId || delta === 0}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("অ্যাডজাস্ট", "Adjust")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}