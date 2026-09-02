"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Package, Star, EyeOff, Pencil, Plus, AlertTriangle, Trash2, Loader2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AdminProduct {
  id: string;
  sku: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  categoryId: string;
  category?: { nameEn: string; nameBn: string };
  mrp: number | string;
  salePrice: number | string;
  unit: string;
  isFeatured: boolean;
  isActive: boolean;
  isNew?: boolean;
  trackStock?: boolean;
  inventory?: { stockQty: number; lowStockThreshold: number };
}

export function ProductsList({
  filter,
  titleBn,
  titleEn,
  descBn,
  descEn,
  showAddButton = true,
}: {
  filter?: "all" | "featured" | "inactive" | "low-stock";
  titleBn: string;
  titleEn: string;
  descBn?: string;
  descEn?: string;
  showAddButton?: boolean;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  // Pre-fill `q` from `?q=...` so the global admin-top-bar search
  // ("/admin/products?q=rice") lands on this list pre-filtered.
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "products", filter, q, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("perPage", String(perPage));
      if (q) params.set("q", q);
      return api.get(`/admin/products?${params.toString()}`);
    },
  });

  const items: AdminProduct[] = (data?.items ?? []) as any;
  const total: number = (data?.total ?? 0) as number;

  let filtered = items;
  if (filter === "featured") filtered = items.filter((p) => p.isFeatured && p.isActive);
  if (filter === "inactive") filtered = items.filter((p) => !p.isActive);
  if (filter === "low-stock")
    filtered = items.filter(
      (p) =>
        p.trackStock &&
        (p.inventory?.stockQty ?? 0) <= (p.inventory?.lowStockThreshold ?? 10),
    );

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/products/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success(t("�পডেট হয়েছে", "Updated"));
    },
  });

  const toggleFeatured = useMutation({
    mutationFn: (vars: { id: string; isFeatured: boolean }) =>
      api.patch(`/admin/products/${vars.id}`, { isFeatured: vars.isFeatured }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      toast.success(t("পণ্য মুছে ফেলা হয়েছে", "Product deleted"));
    },
    onError: (e: any) =>
      toast.error(
        e?.data?.message?.toString?.() ??
          (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ??
          "Delete failed",
      ),
  });

  const confirmDelete = (p: AdminProduct) => {
    if (
      !window.confirm(
        t(
          `"${p.nameBn}" মুছে ফেলবেন? এটি নিষ্ক্রিয় করা হবে।`,
          `Delete "${p.nameEn}"? It will be deactivated.`,
        ),
      )
    )
      return;
    deleteProduct.mutate(p.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t(titleBn, titleEn)}</h1>
          {(descBn || descEn) && <p className="mt-1 text-sm text-ink-500">{t(descBn ?? "", descEn ?? "")}</p>}
        </div>
        {showAddButton && (
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/products/bulk-import">
              <Button variant="outline"><Upload className="h-4 w-4" /> {t("বাল্ক ইমপোর্ট", "Bulk Import")}</Button>
            </Link>
            <Link href="/admin/products/new">
              <Button><Plus className="h-4 w-4" /> {t("নতুন পণ্য", "Add Product")}</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t("SKU, নাম, স্লাগ...", "SKU, name, slug...")}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন পণ্য নেই", "No products")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2">{t("পণ্য", "Product")}</th>
                    <th className="px-3 py-2">{t("ক্যাটাগরি", "Category")}</th>
                    <th className="px-3 py-2 text-right">{t("MRP", "MRP")}</th>
                    <th className="px-3 py-2 text-right">{t("বিক্রয় মূল্য", "Sale")}</th>
                    <th className="px-3 py-2 text-right">{t("স্টক", "Stock")}</th>
                    <th className="px-3 py-2">{t("স্ট্যাটাস", "Status")}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const stock = p.inventory?.stockQty ?? 0;
                    const threshold = p.inventory?.lowStockThreshold ?? 10;
                    const lowStock = stock <= threshold;
                    const sale = Number(p.salePrice);
                    const mrp = Number(p.mrp);
                    const discountPct = mrp > 0 ? Math.round(((mrp - sale) / mrp) * 100) : 0;
                    return (
                      <tr key={p.id} className="border-t border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                              <Package className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-semibold">{lang === "bn" ? p.nameBn : p.nameEn}</div>
                              <div className="font-mono text-[10px] text-ink-500">{p.sku}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">{p.category ? (lang === "bn" ? p.category.nameBn : p.category.nameEn) : "—"}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          <span className={discountPct > 0 ? "text-ink-400 line-through" : ""}>{formatBDT(mrp)}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{formatBDT(sale)}</td>
                        <td className="px-3 py-2 text-right">
                          {p.trackStock ? (
                            <>
                              <span className={cn("font-semibold", lowStock ? "text-danger-700" : "text-ink-900 dark:text-ink-900")}>
                                {stock}
                              </span>
                              {lowStock && <AlertTriangle className="ml-1 inline h-3 w-3 text-danger-700" />}
                            </>
                          ) : (
                            <span className="text-xs italic text-ink-400">আনলিমিটেড</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {p.isFeatured && <Badge variant="accent" className="text-[10px]">⭐ Featured</Badge>}
                            {!p.isActive && <Badge variant="muted" className="text-[10px]">Inactive</Badge>}
                            {p.isNew && <Badge variant="info" className="text-[10px]">New</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Link href={`/admin/products/${p.id}/edit`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={t("সম্পাদনা", "Edit")}
                              >
                                <Pencil className="h-4 w-4 text-primary-700 dark:text-primary-300" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleFeatured.mutate({ id: p.id, isFeatured: !p.isFeatured })}
                              title={p.isFeatured ? t("ফিচার্ড থেকে সরান", "Unfeature") : t("ফিচার্ড করুন", "Feature")}
                            >
                              <Star className={cn("h-4 w-4", p.isFeatured ? "fill-accent-500 text-accent-500 dark:text-accent-300" : "text-ink-400 dark:text-ink-300")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleActive.mutate({ id: p.id, isActive: !p.isActive })}
                              title={p.isActive ? t("নিষ্ক্রিয়", "Deactivate") : t("সক্রিয়", "Activate")}
                            >
                              <EyeOff className={cn("h-4 w-4", p.isActive ? "text-warning-700 dark:text-warning-300" : "text-success-700 dark:text-success-300")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete(p)}
                              disabled={deleteProduct.isPending}
                              title={t("মুছুন", "Delete")}
                            >
                              {deleteProduct.isPending && deleteProduct.variables === p.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-danger-700 dark:text-danger-300" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-danger-700 dark:text-danger-300" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <DataTablePagination
          page={page}
          perPage={perPage}
          total={total}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
          showRange
        />
      </Card>
    </div>
  );
}
