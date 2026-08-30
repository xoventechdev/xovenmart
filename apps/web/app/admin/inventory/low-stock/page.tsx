"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Search,
  RefreshCw,
  Plus,
  X,
  Save,
  Package,
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

const REASONS = ["PURCHASE", "SALE", "ADJUSTMENT", "RETURN", "DAMAGE", "EXPIRED"] as const;

export default function LowStockPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin", "inventory", "low-stock"],
    queryFn: () => api.get<{ count: number; items: InventoryItem[] }>("/admin/inventory/low-stock"),
  });

  const items: InventoryItem[] = (data?.items ?? []) as any;

  const filtered = items.filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      it.nameEn.toLowerCase().includes(q) ||
      it.nameBn.toLowerCase().includes(q) ||
      it.sku.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("কম স্টক", "Low Stock")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("পুনরায় স্টক করার প্রয়োজন এমন পণ্য", "Products that need restocking")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory">
            <Button variant="outline">
              <Package className="h-4 w-4" /> {t("সব ইনভেন্টরি", "All Inventory")}
            </Button>
          </Link>
          <Button onClick={() => setAdjustOpen(true)}>
            <Plus className="h-4 w-4" /> {t("স্টক অ্যাডজাস্ট", "Adjust Stock")}
          </Button>
        </div>
      </div>

      {/* Stat header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs uppercase text-ink-500">{t("কম স্টক আইটেম", "Low stock items")}</div>
              <div className="text-2xl font-bold text-ink-900 dark:text-ink-900">{data?.count ?? items.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

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
            {t("কম স্টক আইটেম", "Low-stock items")} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-success-700" />
              <p className="mt-2 text-sm text-ink-500">{t("কম স্টকের কোন আইটেম নেই — দারুণ!", "No low-stock items — great job!")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("SKU", "SKU")}</th>
                    <th className="px-3 py-2 text-left">{t("পণ্য", "Product")}</th>
                    <th className="px-3 py-2 text-right">{t("স্টক", "Stock")}</th>
                    <th className="px-3 py-2 text-right">{t("থ্রেশহোল্ড", "Threshold")}</th>
                    <th className="px-3 py-2 text-left">{t("ঘাটতি", "Shortage")}</th>
                    <th className="px-3 py-2 text-left">{t("অবস্থা", "Status")}</th>
                    <th className="px-3 py-2 text-left">{t("আপডেট", "Updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const isOut = it.stockQty <= 0;
                    const shortage = Math.max(0, it.lowStockThreshold - it.stockQty);
                    return (
                      <tr key={it.id} className="border-t border-ink-200 dark:border-ink-300 hover:bg-ink-50 dark:hover:bg-ink-100">
                        <td className="px-3 py-2 font-mono text-xs text-ink-700 dark:text-ink-900">{it.sku}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{lang === "bn" ? it.nameBn : it.nameEn}</div>
                          <div className="text-xs text-ink-500">/{it.slug}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{it.stockQty}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-500">{it.lowStockThreshold}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-danger-700">−{shortage}</td>
                        <td className="px-3 py-2">
                          <Badge variant={isOut ? "danger" : "warning"}>
                            {isOut ? t("স্টক আউট", "Out of stock") : t("কম স্টক", "Low stock")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-500">{formatDate(it.updatedAt, lang)}</td>
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
            qc.invalidateQueries({ queryKey: ["admin", "inventory"] });
          }}
        />
      )}
    </div>
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

interface ProductLite {
  id: string;
  sku: string;
  nameEn: string;
  nameBn: string;
}

function AdjustStockModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState<number>(0);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("PURCHASE");
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
            <Field label={t("পরিবর্তন (±)", "Delta (±)")}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}