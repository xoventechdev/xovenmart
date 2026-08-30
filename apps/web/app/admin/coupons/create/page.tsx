"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  Ticket,
  Calendar,
  Hash,
  DollarSign,
  Image as ImageIcon,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Type = "PERCENT" | "FLAT" | "FREE_DELIVERY";
type Scope = "ALL" | "SPECIFIC_PRODUCTS" | "SPECIFIC_CATEGORIES";

export default function CreateCouponPage() {
  const router = useRouter();
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    code: "",
    type: "PERCENT" as Type,
    value: 10,
    scope: "ALL" as Scope,
    minOrder: 0,
    maxDiscount: "" as string | number,
    startsAt: defaultStart(),
    endsAt: defaultEnd(),
    usageLimit: "" as string | number, // empty -> unlimited
    usagePerUserLimit: 1,
    firstOrderOnly: false,
    descriptionBn: "",
    descriptionEn: "",
    bannerImageUrl: "",
  });

  // Selected product / category ids (Set for O(1) toggle)
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const body: any = {
        code: form.code,
        type: form.type,
        value: Number(form.value),
        scope: form.scope,
        minOrder: Number(form.minOrder) || 0,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        usagePerUserLimit: Number(form.usagePerUserLimit) || 1,
        firstOrderOnly: form.firstOrderOnly,
        descriptionBn: form.descriptionBn || null,
        descriptionEn: form.descriptionEn || null,
        bannerImageUrl: form.bannerImageUrl || null,
      };
      if (form.maxDiscount !== "" && form.maxDiscount != null) {
        body.maxDiscount = Number(form.maxDiscount);
      } else {
        body.maxDiscount = null;
      }
      if (form.usageLimit !== "" && form.usageLimit != null) {
        body.usageLimit = Number(form.usageLimit);
      } else {
        body.usageLimit = null;
      }
      // Scope-specific arrays (required by backend when scope narrows)
      if (form.scope === "SPECIFIC_PRODUCTS") {
        body.productIds = productIds;
      }
      if (form.scope === "SPECIFIC_CATEGORIES") {
        body.categoryIds = categoryIds;
      }
      return api.post("/admin/coupons/create", body);
    },
    onSuccess: () => {
      toast.success(t("কুপন তৈরি হয়েছে", "Coupon created"));
      router.push("/admin/coupons");
    },
    onError: (e: any) =>
      toast.error(e?.data?.message ?? t("তৈরি ব্যর্থ", "Create failed")),
  });

  const scopeNeedsProducts = form.scope === "SPECIFIC_PRODUCTS";
  const scopeNeedsCategories = form.scope === "SPECIFIC_CATEGORIES";

  const valid =
    !!form.code &&
    form.code.trim().length > 0 &&
    !!form.startsAt &&
    !!form.endsAt &&
    new Date(form.endsAt) > new Date(form.startsAt) &&
    (form.type === "FREE_DELIVERY" || !!form.value) &&
    Number(form.value) >= 0 &&
    (!scopeNeedsProducts || productIds.length > 0) &&
    (!scopeNeedsCategories || categoryIds.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/coupons"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("কুপন তালিকায়", "Back to coupons")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("নতুন কুপন", "Create Coupon")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "একটি নতুন ডিসকাউন্ট কুপন কনফিগার করুন",
            "Configure a new discount coupon",
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> {t("মূল তথ্য", "Basics")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label={t("কোড", "Code")} hint={t("ইংরেজি বড় হাতের অক্ষরে স্বয়ংক্রিয়ভাবে", "Auto-uppercased")}>
            <div className="relative">
              <Hash className="absolute left-2 top-2.5 h-4 w-4 text-ink-400" />
              <Input
                value={form.code}
                onChange={(e) =>
                  setForm((s) => ({ ...s, code: e.target.value.toUpperCase().replace(/\s+/g, "") }))
                }
                placeholder="EID25"
                className="pl-8 font-mono"
              />
            </div>
          </Field>

          <Field label={t("ধরন", "Type")}>
            <select
              value={form.type}
              onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as Type }))}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="PERCENT">{t("শতাংশ (PERCENT)", "Percent (PERCENT)")}</option>
              <option value="FLAT">{t("ফ্ল্যাট পরিমাণ (FLAT)", "Flat amount (FLAT)")}</option>
              <option value="FREE_DELIVERY">{t("ফ্রি ডেলিভারি (FREE_DELIVERY)", "Free delivery")}</option>
            </select>
          </Field>

          {form.type !== "FREE_DELIVERY" && (
            <Field
              label={form.type === "PERCENT" ? t("শতাংশ (0-100)", "Percent (0-100)") : t("পরিমাণ (৳)", "Amount (BDT)")}
            >
              <div className="relative">
                <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-ink-400" />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm((s) => ({ ...s, value: Number(e.target.value) }))}
                  className="pl-8"
                />
              </div>
            </Field>
          )}

          <Field label={t("স্কোপ", "Scope")}>
            <select
              value={form.scope}
              onChange={(e) => setForm((s) => ({ ...s, scope: e.target.value as Scope }))}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="ALL">{t("সব পণ্য (ALL)", "All products")}</option>
              <option value="SPECIFIC_PRODUCTS">{t("নির্দিষ্ট পণ্য", "Specific products")}</option>
              <option value="SPECIFIC_CATEGORIES">{t("নির্দিষ্ট ক্যাটাগরি", "Specific categories")}</option>
            </select>
          </Field>

          {scopeNeedsProducts && (
            <ProductPicker
              selectedIds={productIds}
              onChange={setProductIds}
              query={productQuery}
              onQueryChange={setProductQuery}
              t={t}
            />
          )}
          {scopeNeedsCategories && (
            <CategoryPicker
              selectedIds={categoryIds}
              onChange={setCategoryIds}
              query={categoryQuery}
              onQueryChange={setCategoryQuery}
              t={t}
            />
          )}

          <Field label={t("ন্যূনতম অর্ডার (৳)", "Min order (BDT)")}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.minOrder}
              onChange={(e) => setForm((s) => ({ ...s, minOrder: Number(e.target.value) }))}
            />
          </Field>

          {form.type === "PERCENT" && (
            <Field
              label={t("সর্বোচ্চ ছাড় (ঐচ্ছিক, ৳)", "Max discount cap (optional, BDT)")}
              hint={t("PERCENT এর জন্য সর্বোচ্চ ডিসকাউন্ট সীমা", "Upper bound when type is PERCENT")}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.maxDiscount}
                onChange={(e) => setForm((s) => ({ ...s, maxDiscount: e.target.value }))}
                placeholder={t("যেমন ৫০০", "e.g. 500")}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" /> {t("সময়কাল ও ব্যবহার", "Validity & Usage")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label={t("শুরু (Start)", "Starts at")}>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((s) => ({ ...s, startsAt: e.target.value }))}
            />
          </Field>
          <Field label={t("শেষ (End)", "Ends at")}>
            <Input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm((s) => ({ ...s, endsAt: e.target.value }))}
            />
          </Field>
          <Field label={t("মোট ব্যবহার সীমা (ঐচ্ছিক)", "Total usage limit (optional)")} hint={t("খালি রাখলে আনলিমিটেড", "Leave empty for unlimited")}>
            <Input
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(e) => setForm((s) => ({ ...s, usageLimit: e.target.value }))}
              placeholder={t("যেমন ১০০", "e.g. 100")}
            />
          </Field>
          <Field label={t("প্রতি ব্যবহারকারী সীমা", "Per-user limit")}>
            <Input
              type="number"
              min={1}
              value={form.usagePerUserLimit}
              onChange={(e) => setForm((s) => ({ ...s, usagePerUserLimit: Number(e.target.value) }))}
            />
          </Field>
          <Field label={t("প্রথম অর্ডারের জন্য?", "First-order-only?")} className="md:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.firstOrderOnly}
                onChange={(e) => setForm((s) => ({ ...s, firstOrderOnly: e.target.checked }))}
                className="h-4 w-4 rounded border-ink-300 text-primary-700"
              />
              <span className="text-sm">
                {t(
                  "শুধুমাত্র নতুন গ্রাহকের প্রথম অর্ডারে ব্যবহারযোগ্য",
                  "Only valid on a customer's first order",
                )}
              </span>
            </label>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" /> {t("বিবরণ ও ব্যানার", "Description & Banner")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label={t("বিবরণ (বাংলা, ঐচ্ছিক)", "Description (BN, optional)")}>
            <textarea
              value={form.descriptionBn}
              onChange={(e) => setForm((s) => ({ ...s, descriptionBn: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </Field>
          <Field label={t("বিবরণ (EN, ঐচ্ছিক)", "Description (EN, optional)")}>
            <textarea
              value={form.descriptionEn}
              onChange={(e) => setForm((s) => ({ ...s, descriptionEn: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </Field>
          <Field
            label={t("ব্যানার ছবির URL (ঐচ্ছিক)", "Banner image URL (optional)")}
            className="md:col-span-2"
            hint={t("প্রোমো ব্যানার হিসেবে প্রদর্শনের জন্য", "Used as promo banner")}
          >
            <Input
              value={form.bannerImageUrl}
              onChange={(e) => setForm((s) => ({ ...s, bannerImageUrl: e.target.value }))}
              placeholder="https://..."
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/admin/coupons">
          <Button variant="outline">{t("বাতিল", "Cancel")}</Button>
        </Link>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !valid}>
          <Save className="h-4 w-4" />
          {save.isPending ? t("তৈরি হচ্ছে...", "Creating...") : t("তৈরি করুন", "Create Coupon")}
        </Button>
      </div>
    </div>
  );
}

function defaultStart() {
  const d = new Date();
  d.setSeconds(0, 0);
  // Local datetime-local format: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * ProductPicker
 * Multi-select list of products, shown only when scope=SPECIFIC_PRODUCTS.
 * Loads /catalog/products?perPage=50, lets the admin search/filter, and
 * toggle which product ids are part of the coupon. Reflects the selection
 * back up to the parent so the form payload includes productIds[].
 * ──────────────────────────────────────────────────────────────── */
function ProductPicker({
  selectedIds,
  onChange,
  query,
  onQueryChange,
  t,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  query: string;
  onQueryChange: (q: string) => void;
  t: (bn: string, en: string) => string;
}) {
  const { lang } = useTheme();

  // Fetch a reasonable page of products. Admin can search by typing.
  const { data, isLoading } = useQuery({
    queryKey: ["catalog", "products", { pick: "for-coupon", perPage: 200 }],
    queryFn: () => api.get("/catalog/products?perPage=200"),
    staleTime: 60_000,
  });
  const products: any[] = useMemo(() => (data?.items ?? []) as any[], [data]);

  // Local filter for the picker (client-side; cheap on ≤200 rows).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 60);
    return products
      .filter((p) => {
        const name = (p.nameEn || p.nameBn || "").toLowerCase();
        const sku = (p.sku || "").toLowerCase();
        const slug = (p.slug || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || slug.includes(q);
      })
      .slice(0, 60);
  }, [products, query]);

  const selected = selectedIds;
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <Field
      label={t("নির্বাচিত পণ্য", "Selected products")}
      hint={t(
        `কমপক্ষে একটি পণ্য নির্বাচন করুন (${selected.length}টি নির্বাচিত)`,
        `Pick at least one product (${selected.length} selected)`,
      )}
      className="md:col-span-2"
    >
      <div className="rounded-md border border-ink-200 dark:border-ink-300">
        <div className="flex items-center gap-2 border-b border-ink-200 p-2 dark:border-ink-300">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("পণ্য খুঁজুন (নাম / SKU / স্লাগ)...", "Search products (name / SKU / slug)...")}
            className="flex-1"
          />
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="shrink-0 text-xs text-danger-700 hover:text-danger-800"
            >
              {t("সব মুছুন", "Clear all")}
            </Button>
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-ink-200 bg-ink-50 p-2 dark:border-ink-300 dark:bg-ink-100">
            {selected.map((id) => {
              const p = products.find((x) => x.id === id);
              const name = p ? (lang === "en" ? p.nameEn || p.nameBn : p.nameBn || p.nameEn) : id;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-800 dark:text-primary-100"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="rounded-full p-0.5 hover:bg-primary-200 dark:hover:bg-primary-700"
                    aria-label="remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("লোড হচ্ছে...", "Loading...")}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-500">
              {t("কোনো পণ্য পাওয়া যায়নি", "No products found")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((p) => {
                const id = p.id as string;
                const isSel = selected.includes(id);
                const name = lang === "en" ? p.nameEn || p.nameBn : p.nameBn || p.nameEn;
                return (
                  <li key={id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-200 ${
                        isSel ? "bg-primary-50 dark:bg-primary-900/30" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(id)}
                        className="h-4 w-4 rounded border-ink-300 text-primary-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{name}</div>
                        <div className="text-xs text-ink-500">
                          ৳{Number(p.salePrice || 0).toLocaleString("en-IN")} ·{" "}
                          {p.sku ? `SKU ${p.sku}` : ""}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {selected.length === 0 && (
        <p className="mt-1 text-xs text-amber-600">
          {t("কমপক্ষে একটি পণ্য নির্বাচন করুন", "Select at least one product")}
        </p>
      )}
    </Field>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * CategoryPicker — same pattern as ProductPicker but for categories.
 * ──────────────────────────────────────────────────────────────── */
function CategoryPicker({
  selectedIds,
  onChange,
  query,
  onQueryChange,
  t,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  query: string;
  onQueryChange: (q: string) => void;
  t: (bn: string, en: string) => string;
}) {
  const { lang } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["catalog", "categories", "all-for-coupon"],
    queryFn: () => api.get("/catalog/categories"),
    staleTime: 5 * 60_000,
  });
  const cats: any[] = useMemo(() => (Array.isArray(data) ? data : []) as any[], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter((c) =>
      [c.nameEn, c.nameBn, c.slug].some((s) => (s ?? "").toLowerCase().includes(q)),
    );
  }, [cats, query]);

  const selected = selectedIds;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Field
      label={t("নির্বাচিত ক্যাটাগরি", "Selected categories")}
      hint={t(
        `কমপক্ষে একটি ক্যাটাগরি নির্বাচন করুন (${selected.length}টি নির্বাচিত)`,
        `Pick at least one category (${selected.length} selected)`,
      )}
      className="md:col-span-2"
    >
      <div className="rounded-md border border-ink-200 dark:border-ink-300">
        <div className="flex items-center gap-2 border-b border-ink-200 p-2 dark:border-ink-300">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("ক্যাটাগরি খুঁজুন (নাম / স্লাগ)...", "Search categories (name / slug)...")}
            className="flex-1"
          />
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="shrink-0 text-xs text-danger-700 hover:text-danger-800"
            >
              {t("সব মুছুন", "Clear all")}
            </Button>
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-ink-200 bg-ink-50 p-2 dark:border-ink-300 dark:bg-ink-100">
            {selected.map((id) => {
              const c = cats.find((x) => x.id === id);
              const name = c ? (lang === "en" ? c.nameEn || c.nameBn : c.nameBn || c.nameEn) : id;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-800 dark:text-primary-100"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    className="rounded-full p-0.5 hover:bg-primary-200 dark:hover:bg-primary-700"
                    aria-label="remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("লোড হচ্ছে...", "Loading...")}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-500">
              {t("কোনো ক্যাটাগরি পাওয়া যায়নি", "No categories found")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((c) => {
                const id = c.id as string;
                const isSel = selected.includes(id);
                const name = lang === "en" ? c.nameEn || c.nameBn : c.nameBn || c.nameEn;
                return (
                  <li key={id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-ink-100 dark:hover:bg-ink-200 ${
                        isSel ? "bg-primary-50 dark:bg-primary-900/30" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(id)}
                        className="h-4 w-4 rounded border-ink-300 text-primary-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{name}</div>
                        <div className="text-xs text-ink-500">{c.slug ?? ""}</div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {selected.length === 0 && (
        <p className="mt-1 text-xs text-amber-600">
          {t("কমপক্ষে একটি ক্যাটাগরি নির্বাচন করুন", "Select at least one category")}
        </p>
      )}
    </Field>
  );
}