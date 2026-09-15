"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, ArrowLeft, Package, Check, X, Loader2, Layers } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import { ProductImagesCard, type ProductImageItem } from "./product-images-card";
import { VariantEditor, type VariantDraft } from "./variant-editor";
import { MAX_VARIANTS_PER_PRODUCT, validateVariantRow } from "./_validation/variants";

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
  /**
   * Phase 1 variants flag — when true, the product is sold as a set of
   * `variants[]` (each with its own price/stock/weight) and the
   * parent-scalar pricing/stock fields are ignored at the cart +
   * storefront layers. When false (legacy single-SKU behavior) the
   * `mrp` / `salePrice` / `stockQty` scalars above are authoritative
   * and `variants[]` must be empty.
   */
  hasVariants: boolean;
  /**
   * Per-variant rows. Empty when `hasVariants === false`; when true
   * the array must contain at least one row (validated both client-
   * and server-side). Each item ships its `id` when hydrated from
   * an existing DB row so the server's diff logic can match it for
   * updates vs inserts vs deletes.
   */
  variants: VariantDraft[];
  /**
   * Images attached to the product. UI-only shape — the backend just
   * wants `{ url, altBn, altEn, sortOrder }[]`. `id` tracks the
   * existing DB row so the picker can hydrate it on edit. The
   * `source` field is purely a UI hint for which icon to render.
   */
  images: ProductImageItem[];
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
  // Default to "unlimited" — the admin can still override per-product.
  // See `UNLIMITED_STOCK_QTY` on the backend (999999 — surfaced as ∞ in UI).
  stockQty: 999999,
  lowStockThreshold: 10,
  isFeatured: false,
  isNew: false,
  hasVariants: false,
  variants: [],
  images: [],
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

  // Preview the next auto-generated SKU for the read-only SKU field.
  // Only meaningful on create; in edit mode the real SKU is already shown.
  const { data: nextSkuPreview } = useQuery<{ next: string }>({
    queryKey: ["admin", "sku-counter", "next"],
    queryFn: () => api.get("/admin/system/sku-counter/next"),
    enabled: !isEdit,
    staleTime: 30_000,
  });

  const [form, setForm] = useState<ProductFormValues>({ ...EMPTY, ...initial });
  const [hydrated, setHydrated] = useState(!isEdit);

  // ─── Slug auto-fill + real-time uniqueness check ───
  //
  // `slugTouched` is `true` from the start in edit mode (so we don't
  // clobber an existing DB slug until the admin actually edits the
  // nameEn field), and `false` on create (so nameEn progressively
  // fills the slug until the admin touches it). Once the admin types
  // in the slug field, `slugTouched` flips to `true` permanently.
  // Clearing the slug field flips it back to `false` on blur, so the
  // nameEn → slug auto-fill resumes.
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [slugToCheck, setSlugToCheck] = useState(form.slug);
  // Track the last slug we already auto-applied a suffix to, to avoid
  // looping the auto-suffix effect when the suggestion equals the slug.
  const slugAutoAppliedRef = useRef<string>("");

  // When product loads, populate form
  useEffect(() => {
    if (!isEdit || !productData) return;
    // The backend serializes existing `ProductImage` rows as
    // `{ id, productId, url, altBn, altEn, sortOrder, createdAt }`.
    // Map them to the UI shape — `source: "library"` so the tile shows
    // the "Library" chip (we don't actually know if the row was
    // originally uploaded via the media library or pasted as a URL,
    // but visually the chip is consistent and the source label doesn't
    // appear on the public site).
    const images: ProductImageItem[] = Array.isArray(productData.images)
      ? productData.images.map((im: any, i: number) => ({
          id: im.id ?? null,
          url: im.url ?? "",
          altBn: im.altBn ?? "",
          altEn: im.altEn ?? "",
          source: im.url?.startsWith("data:") ? "uploaded" : "library",
          sortOrder: typeof im.sortOrder === "number" ? im.sortOrder : i,
        }))
      : [];
    // Variants: backend returns `{ id, name, skuSuffix, priceMrp,
    // priceSale, weightGrams, stockQty, sortOrder, isActive, inventory }`.
    // Map to the UI shape (`weightGrams: number | null`, `id: string | null`)
    // — the rest of the form only reads the scalars; we don't need
    // `inventory` here (stock is already on the variant row).
    const variants: VariantDraft[] = Array.isArray(productData.variants)
      ? productData.variants.map((v: any, i: number) => ({
          id: v.id ?? null,
          name: v.name ?? "",
          skuSuffix: (v.skuSuffix ?? "").toString().toUpperCase(),
          priceMrp: Number(v.priceMrp) || 0,
          priceSale: Number(v.priceSale) || 0,
          weightGrams:
            v.weightGrams === null || v.weightGrams === undefined
              ? null
              : Number(v.weightGrams),
          stockQty: Number(v.stockQty) || 0,
          sortOrder: typeof v.sortOrder === "number" ? v.sortOrder : i,
          isActive: v.isActive !== false,
        }))
      : [];
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
      hasVariants: !!productData.hasVariants,
      variants,
      images,
    });
    setHydrated(true);
  }, [productData, isEdit]);

  // ─── Real-time slug uniqueness check (debounced 400ms) ───
  //
  // The endpoint returns either { available: true } or
  // { available: false, suggestion: "<base>-N", conflict: {...} }.
  // We surface the green/red border + spinner here and let a separate
  // effect (below) transparently apply the suggestion when the admin
  // is still on the base slug.
  const { data: slugCheck, isFetching: slugChecking } = useQuery<{
    base: string;
    available: boolean;
    slug: string;
    suggestion: string | null;
    conflict: { id: string; slug: string } | null;
  }>({
    queryKey: [
      "admin",
      "product",
      "check-slug",
      slugToCheck,
      productId ?? "new",
    ],
    queryFn: () =>
      api.get(
        `/admin/products/check-slug?slug=${encodeURIComponent(slugToCheck)}` +
          (productId ? `&ignoreId=${productId}` : ""),
      ),
    // Don't fire until the admin has typed something AND we've finished
    // the debounce. `slugToCheck` is updated by the effect below.
    enabled: slugToCheck.length > 0,
    staleTime: 0,
    retry: false,
  });

  // Debounce: only push the current slug into `slugToCheck` after 400ms
  // of no further typing. Without this the query would fire on every
  // keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSlugToCheck(form.slug), 400);
    return () => clearTimeout(handle);
  }, [form.slug]);

  // ─── Auto-fill: when `nameEn` changes, mirror it into `slug` unless
  // the admin has already touched the slug field. ───
  useEffect(() => {
    if (slugTouched) return;
    if (!form.nameEn) return;
    const next = slugify(form.nameEn);
    if (next !== form.slug) {
      setForm((s) => ({ ...s, slug: next }));
    }
  }, [form.nameEn, slugTouched, form.slug]);

  // ─── Auto-suffix: when the slug is taken AND the admin is still on
  // the base (hasn't typed past it), transparently apply the suggestion.
  // Only fires when `slugTouched === false` (i.e. the slug field is
  // still being driven by nameEn). Manual edits get a "X is taken — use
  // Y" hint link instead. ───
  useEffect(() => {
    if (slugTouched) return;
    if (!slugCheck) return;
    if (slugCheck.available) return;
    if (!slugCheck.suggestion) return;
    if (slugAutoAppliedRef.current === slugCheck.suggestion) return;
    if (form.slug !== slugCheck.base) return;
    slugAutoAppliedRef.current = slugCheck.suggestion;
    setForm((s) => ({ ...s, slug: slugCheck.suggestion! }));
  }, [slugCheck, slugTouched, form.slug]);

  const save = useMutation({
    mutationFn: () => {
      // Strip UI-only fields (`id`, `source`) and shape the images
      // array to the backend's contract. The server replaces the
      // product's image set with whatever we send, so the order we
      // hand it here is the order that gets stored.
      //
      // Variants: we send `variants[]` only when `hasVariants === true`.
      // The server's `validateVariantsArray()` still re-validates
      // every row — the client validator is a fast feedback channel,
      // not a trust boundary. Each row keeps its `id` (null for fresh
      // rows) so the diff logic can match existing rows for updates.
      const payload = {
        ...form,
        // Strip the top-level UI shape — the backend already knows the
        // legacy scalar fields and doesn't want `images` re-mapped.
        images: form.images.map((im) => ({
          url: im.url,
          altBn: im.altBn || null,
          altEn: im.altEn || null,
          sortOrder: im.sortOrder,
        })),
        variants: form.hasVariants
          ? form.variants.map((v) => ({
              id: v.id,
              name: v.name,
              skuSuffix: v.skuSuffix,
              priceMrp: v.priceMrp,
              priceSale: v.priceSale,
              weightGrams: v.weightGrams,
              stockQty: v.stockQty,
              sortOrder: v.sortOrder,
              isActive: v.isActive,
            }))
          : [],
      };
      return isEdit
        ? api.patch(`/admin/products/${productId}`, payload)
        : api.post("/admin/products", payload);
    },
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

  // Per-row variant validation. When `hasVariants === true`, we block
  // the save button on the first row that has an error so the admin
  // can't ship a payload the server would 400 anyway. The server
  // re-validates on submit — this is fast feedback only.
  const variantErrors = useMemo(() => {
    if (!form.hasVariants) return [];
    return form.variants
      .map((row, idx) => {
        const siblings = form.variants
          .filter((_, i) => i !== idx)
          .map((r) => r.skuSuffix.toUpperCase());
        const err = validateVariantRow(row, siblings);
        return err ? idx : -1;
      })
      .filter((idx) => idx >= 0);
  }, [form.hasVariants, form.variants]);

  const canSave =
    !!form.slug &&
    !!form.nameBn &&
    !!form.nameEn &&
    !!form.categoryId &&
    // Slug must be either available or still loading. `undefined`
    // (loading) or `true` (confirmed available) lets the save proceed;
    // `false` blocks it so the admin can't ship a known-collision.
    // The DB unique constraint + `save.onError` toast catch any
    // race-condition writes (admin saves before the check returns).
    slugCheck?.available !== false &&
    // Block on the first variant validation error. We don't require
    // every row to be perfect — just one error stops the save.
    variantErrors.length === 0;

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
          <Field
            label="SKU"
            disabled={!isEdit}
            hint={
              isEdit
                ? t("SKU লক করা — সম্পাদনা যোগ্য নয়", "SKU is locked — not editable")
                : t(
                    `অটো-জেনারেটেড — পরবর্তী: ${nextSkuPreview?.next ?? "…"}`,
                    `Auto-generated — next: ${nextSkuPreview?.next ?? "…"}`,
                  )
            }
          >
            <Input
              value={isEdit ? form.sku : (nextSkuPreview?.next ?? "…")}
              disabled
              readOnly
              placeholder="XM-000001"
              className="font-mono"
            />
          </Field>
          <Field label="Slug" hint={t("URL: /product/{slug}", "URL: /product/{slug}")}>
            <div className="relative">
              <Input
                value={form.slug}
                onChange={(e) => {
                  // Any manual edit breaks the nameEn → slug auto-fill
                  // for the rest of this form session (unless cleared —
                  // see onBlur below).
                  setSlugTouched(true);
                  setForm((s) => ({ ...s, slug: slugify(e.target.value) }));
                }}
                onBlur={(e) => {
                  // If the admin cleared the field entirely, re-enable
                  // auto-fill so nameEn starts driving it again.
                  if (e.target.value.trim() === "") {
                    setSlugTouched(false);
                  }
                }}
                placeholder="rice-premium"
                className={cn(
                  form.slug &&
                    slugCheck?.available === true &&
                    "border-success-500 focus-visible:ring-success-300",
                  form.slug &&
                    slugCheck?.available === false &&
                    "border-danger-500 focus-visible:ring-danger-300",
                )}
              />
              {slugToCheck.length > 0 && slugChecking && (
                <Loader2 className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400" />
              )}
              {!slugChecking &&
                form.slug &&
                slugCheck?.available === true && (
                  <Check className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-success-600" />
                )}
              {!slugChecking &&
                form.slug &&
                slugCheck?.available === false && (
                  <X className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-danger-600" />
                )}
            </div>
            {slugCheck?.available === true &&
              form.slug === slugCheck.slug && (
                <p className="mt-1 text-xs text-success-700">
                  {t("উপলব্ধ ✓", "Available ✓")}
                </p>
              )}
            {slugCheck?.available === false &&
              slugCheck.suggestion &&
              // Don't show the "X is taken — use Y" link while the
              // auto-suffix effect is still about to flip the field.
              // We compare to `slugAutoAppliedRef.current` via
              // `slugCheck.suggestion` matched against `form.slug`:
              // if `form.slug` already matches the suggestion, the link
              // is redundant. If `form.slug` matches the base, the
              // auto-suffix effect will fire any moment now.
              form.slug !== slugCheck.suggestion &&
              form.slug === slugCheck.base && (
                <p className="mt-1 text-xs text-ink-500">
                  {t(
                    `"${slugCheck.conflict?.slug ?? slugCheck.base}" ইতিমধ্যে আছে — "${slugCheck.suggestion}" ব্যবহার করা হচ্ছে…`,
                    `"${slugCheck.conflict?.slug ?? slugCheck.base}" is taken — using "${slugCheck.suggestion}"…`,
                  )}
                </p>
              )}
            {slugCheck?.available === false &&
              slugCheck.suggestion &&
              // Admin manually typed something that conflicts — show
              // an explicit clickable suggestion.
              form.slug !== slugCheck.suggestion &&
              form.slug !== slugCheck.base && (
                <p className="mt-1 text-xs">
                  <button
                    type="button"
                    className="font-medium text-primary-700 underline hover:text-primary-800"
                    onClick={() =>
                      setForm((s) => ({ ...s, slug: slugCheck.suggestion! }))
                    }
                  >
                    {t(
                      `"${slugCheck.conflict?.slug ?? slugCheck.base}" ইতিমধ্যে আছে — "${slugCheck.suggestion}" ব্যবহার করুন`,
                      `"${slugCheck.conflict?.slug ?? slugCheck.base}" is taken — use "${slugCheck.suggestion}"`,
                    )}
                  </button>
                </p>
              )}
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
          <Field
            label={t("স্টক (∞ = আনলিমিটেড)", "Stock (∞ = unlimited)")}
            hint={t(
              "ডিফল্ট ৯৯৯৯৯৯ — অ্যাডমিন চাইলে যেকোনো সংখ্যা দিতে পারেন",
              "Default 999999 — admin can override with any number",
            )}
          >
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
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {t("ভ্যারিয়েন্ট", "Variants")}
            </span>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium dark:border-ink-300 dark:bg-ink-50">
              <input
                type="checkbox"
                checked={form.hasVariants}
                onChange={(e) =>
                  setForm((s) => {
                    const next = e.target.checked;
                    if (next) {
                      // Toggling ON with zero rows: seed one empty row
                      // so the form is never in an invalid state (the
                      // server rejects empty `variants[]` when
                      // `hasVariants === true`). We DON'T pre-fill
                      // parent scalars — admin types per-variant
                      // prices from scratch.
                      if (s.variants.length === 0) {
                        return {
                          ...s,
                          hasVariants: true,
                          variants: [
                            {
                              id: null,
                              name: "",
                              skuSuffix: "",
                              priceMrp: s.mrp || 0,
                              priceSale: s.salePrice || 0,
                              weightGrams: null,
                              stockQty: 999999,
                              sortOrder: 0,
                              isActive: true,
                            },
                          ],
                        };
                      }
                      return { ...s, hasVariants: true };
                    }
                    // Toggling OFF: drop all variants (backend rejects
                    // a non-empty variants[] when hasVariants is false).
                    return { ...s, hasVariants: false, variants: [] };
                  })
                }
                className="h-4 w-4 rounded border-ink-300 text-primary-700"
              />
              {t("এই পণ্যের ভ্যারিয়েন্ট আছে", "This product has variants")}
              {form.hasVariants && form.variants.length > 0 && (
                <Badge variant="muted" className="ml-1 font-mono text-[10px]">
                  {form.variants.length}/{MAX_VARIANTS_PER_PRODUCT}
                </Badge>
              )}
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4">
          {form.hasVariants ? (
            <>
              <VariantEditor
                value={form.variants}
                onChange={(variants) => setForm((s) => ({ ...s, variants }))}
                parentSku={form.sku}
              />
              <p className="text-xs text-ink-500">
                {t(
                  `প্রতিটি ভ্যারিয়েন্টের নিজস্ব দাম, স্টক ও SKU সাফিক্স আছে। ` +
                    `কার্ডে "থেকে ৳X" দেখানো হবে এবং কাস্টমারকে পণ্যের পেজে গিয়ে ভ্যারিয়েন্ট বেছে নিতে হবে।`,
                  `Each variant has its own price, stock, and SKU suffix. ` +
                    `Cards show "From ৳X" and customers must pick a variant on the product page.`,
                )}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-500">
              {t(
                "এই পণ্যের কোনো ভ্যারিয়েন্ট নেই — উপরের মূল্য ও স্টক স্কেলার ব্যবহার হবে।",
                "No variants — the scalar price and stock above will be used.",
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <ProductImagesCard
        value={form.images}
        onChange={(images) => setForm((s) => ({ ...s, images }))}
      />

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