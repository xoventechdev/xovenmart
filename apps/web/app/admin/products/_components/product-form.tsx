"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface ProductFormValues {
  sku: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  categoryId: string;
  unit: string;
  mrp: number;
  salePrice: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  isFeatured: boolean;
  isNew: boolean;
}

const EMPTY: ProductFormValues = {
  sku: "",
  slug: "",
  nameBn: "",
  nameEn: "",
  descriptionBn: "",
  descriptionEn: "",
  categoryId: "",
  unit: "piece",
  mrp: 0,
  salePrice: 0,
  costPrice: 0,
  stockQty: 0,
  lowStockThreshold: 10,
  isFeatured: false,
  isNew: false,
};

interface Props {
  /** When provided, the form runs in "edit" mode and PATCHes this id */
  productId?: string;
  /** Initial values — used both as defaults for create and seed for edit */
  initial?: Partial<ProductFormValues>;
  /** Override success redirect (default `/admin/products`) */
  redirectOnSuccess?: string;
}

/**
 * Shared product form used by both `new/page.tsx` and `[id]/edit/page.tsx`.
 * Fetches its own categories + (in edit mode) product data via React Query.
 */
export function ProductForm({ productId, initial, redirectOnSuccess }: Props) {
  const router = useRouter();
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isEdit = !!productId;

  const { data: cats } = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => api.get("/catalog/categories?includeChildren=true"),
  });

  const { data: productData, isLoading: productLoading } = useQuery({
    queryKey: ["admin", "product", productId],
    queryFn: () => api.get(`/admin/products/${productId}`),
    enabled: isEdit,
  });

  const [form, setForm] = useState<ProductFormValues>({ ...EMPTY, ...initial });
  const [hydrated, setHydrated] = useState(!isEdit);

  // When product loads, populate form
  useEffect(() => {
    if (!isEdit || !productData) return;
    setForm({
      sku: productData.sku ?? "",
      slug: productData.slug ?? "",
      nameBn: productData.nameBn ?? "",
      nameEn: productData.nameEn ?? "",
      descriptionBn: productData.descriptionBn ?? "",
      descriptionEn: productData.descriptionEn ?? "",
      categoryId: productData.categoryId ?? "",
      unit: productData.unit ?? "piece",
      mrp: Number(productData.mrp) || 0,
      salePrice: Number(productData.salePrice) || 0,
      costPrice: Number(productData.costPrice) || 0,
      stockQty: productData.inventory?.stockQty ?? 0,
      lowStockThreshold: productData.inventory?.lowStockThreshold ?? 10,
      isFeatured: !!productData.isFeatured,
      isNew: !!productData.isNew,
    });
    setHydrated(true);
  }, [productData, isEdit]);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? api.patch(`/admin/products/${productId}`, form)
        : api.post("/admin/products", form),
    onSuccess: () => {
      toast.success(
        isEdit
          ? t("পণ্য আপডেট হয়েছে", "Product updated")
          : t("পণ্য তৈরি হয়েছে", "Product created"),
      );
      router.push(redirectOnSuccess ?? "/admin/products");
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ||
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ||
        e?.message ||
        "Save failed";
      toast.error(msg);
    },
  });

  // Flatten category tree for select
  const flatCats: { id: string; label: string }[] = [];
  const flatten = (cats: any[], prefix = "") => {
    for (const c of cats ?? []) {
      flatCats.push({ id: c.id, label: prefix + (lang === "bn" ? c.nameBn : c.nameEn) });
      if (c.children?.length) flatten(c.children, prefix + "— ");
    }
  };
  flatten(cats ?? []);

  if (isEdit && productLoading && !hydrated) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-32 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        <div className="h-64 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  const canSave =
    !!form.sku && !!form.slug && !!form.nameBn && !!form.nameEn && !!form.categoryId;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("পণ্য তালিকায়", "Back to products")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
          {isEdit ? t("পণ্য সম্পাদনা", "Edit Product") : t("নতুন পণ্য", "Add Product")}
        </h1>
        {isEdit && productData && (
          <p className="mt-1 font-mono text-xs text-ink-500">
            ID: {productData.id} · {productData.sku}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" /> {t("মৌলিক তথ্য", "Basic Info")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="SKU" disabled={isEdit}>
            <Input
              value={form.sku}
              disabled={isEdit}
              onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))}
              placeholder="PROD-001"
            />
          </Field>
          <Field label="Slug" hint={t("URL: /product/{slug}", "URL: /product/{slug}")}>
            <Input
              value={form.slug}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                }))
              }
            />
          </Field>
          <Field label={t("নাম (বাংলা)", "Name (BN)")}>
            <Input
              value={form.nameBn}
              onChange={(e) => setForm((s) => ({ ...s, nameBn: e.target.value }))}
            />
          </Field>
          <Field label={t("নাম (EN)", "Name (EN)")}>
            <Input
              value={form.nameEn}
              onChange={(e) => setForm((s) => ({ ...s, nameEn: e.target.value }))}
            />
          </Field>
          <Field label={t("ক্যাটাগরি", "Category")}>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((s) => ({ ...s, categoryId: e.target.value }))}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="">{t("— নির্বাচন করুন —", "— Select —")}</option>
              {flatCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("একক", "Unit")}>
            <Input
              value={form.unit}
              onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
              placeholder="piece, kg, ltr..."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("বিবরণ", "Description")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label={t("বিবরণ (বাংলা)", "Description (BN)")} className="md:col-span-2">
            <textarea
              value={form.descriptionBn}
              onChange={(e) => setForm((s) => ({ ...s, descriptionBn: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </Field>
          <Field label={t("বিবরণ (EN)", "Description (EN)")} className="md:col-span-2">
            <textarea
              value={form.descriptionEn}
              onChange={(e) => setForm((s) => ({ ...s, descriptionEn: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("মূল্য ও স্টক", "Pricing & Stock")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Field label="MRP" hint={t("কাটা-ক্রস মূল্য", "Crossed-out price")}>
            <Input
              type="number"
              value={form.mrp}
              onChange={(e) => setForm((s) => ({ ...s, mrp: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t("বিক্রয় মূল্য", "Sale Price")}>
            <Input
              type="number"
              value={form.salePrice}
              onChange={(e) => setForm((s) => ({ ...s, salePrice: Number(e.target.value) }))}
            />
          </Field>
          <Field
            label={t("ক্রয় মূল্য (গোপন)", "Cost Price (private)")}
            hint={t("শুধু অ্যাডমিন দেখবে", "Admin only — never shown to customer")}
          >
            <Input
              type="number"
              value={form.costPrice}
              onChange={(e) => setForm((s) => ({ ...s, costPrice: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t("স্টক", "Stock")}>
            <Input
              type="number"
              value={form.stockQty}
              onChange={(e) => setForm((s) => ({ ...s, stockQty: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t("লো-স্টক থ্রেশহোল্ড", "Low Stock Threshold")}>
            <Input
              type="number"
              value={form.lowStockThreshold}
              onChange={(e) =>
                setForm((s) => ({ ...s, lowStockThreshold: Number(e.target.value) }))
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("অপশন", "Options")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Checkbox
            label={t("হোমপেজে ফিচার্ড হিসেবে দেখান", "Show as featured on homepage")}
            checked={form.isFeatured}
            onChange={(v) => setForm((s) => ({ ...s, isFeatured: v }))}
          />
          <Checkbox
            label={t("'নতুন' ট্যাগ দেখান", "Mark as New")}
            checked={form.isNew}
            onChange={(v) => setForm((s) => ({ ...s, isNew: v }))}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/admin/products">
          <Button variant="outline">{t("বাতিল", "Cancel")}</Button>
        </Link>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
          {save.isPending ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEdit ? t("আপডেট করুন", "Update Product") : t("তৈরি করুন", "Create Product")}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
  disabled,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <label
        className={`text-sm font-medium ${disabled ? "text-ink-400" : "text-ink-700 dark:text-ink-900"}`}
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-ink-300 text-primary-700"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}