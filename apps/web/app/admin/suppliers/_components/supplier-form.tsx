"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save, Star, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SupplierFormData {
  slug: string;
  nameBn: string;
  nameEn: string;
  contactName: string;
  phone: string;
  email: string;
  addressBn: string;
  addressEn: string;
  area: string;
  notesBn: string;
  notesEn: string;
  rating: number;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm: SupplierFormData = {
  slug: "",
  nameBn: "",
  nameEn: "",
  contactName: "",
  phone: "",
  email: "",
  addressBn: "",
  addressEn: "",
  area: "",
  notesBn: "",
  notesEn: "",
  rating: 3,
  sortOrder: 0,
  isActive: true,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {label}
        {required && <span className="ml-1 text-danger-700">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function RatingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="rounded p-1 hover:bg-ink-100 dark:hover:bg-ink-200"
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "h-6 w-6",
              i <= value ? "fill-accent-500 text-accent-500" : "text-ink-300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function SupplierForm({
  mode,
  id,
  initial,
}: {
  mode: "create" | "edit";
  id?: string;
  initial?: Partial<SupplierFormData>;
}) {
  const { lang } = useTheme();
  const router = useRouter();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [form, setForm] = useState<SupplierFormData>({ ...emptyForm, ...initial });
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  // Load existing supplier in edit mode
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["admin", "supplier", id],
    queryFn: () => api.get(`/admin/suppliers/${id}`),
    enabled: mode === "edit" && !!id,
  });

  useEffect(() => {
    if (mode === "edit" && existing) {
      setForm((s) => ({
        ...s,
        slug: existing.slug ?? "",
        nameBn: existing.nameBn ?? "",
        nameEn: existing.nameEn ?? "",
        contactName: existing.contactName ?? "",
        phone: existing.phone ?? "",
        email: existing.email ?? "",
        addressBn: existing.addressBn ?? "",
        addressEn: existing.addressEn ?? "",
        area: existing.area ?? "",
        notesBn: existing.notesBn ?? "",
        notesEn: existing.notesEn ?? "",
        rating: existing.rating ?? 3,
        sortOrder: existing.sortOrder ?? 0,
        isActive: existing.isActive ?? true,
      }));
    }
  }, [existing, mode]);

  // Auto-slug from nameEn unless user has typed in the slug field
  useEffect(() => {
    if (!slugTouched && form.nameEn) {
      setForm((s) => ({ ...s, slug: slugify(form.nameEn) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nameEn]);

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        slug: form.slug?.trim() || undefined,
        nameBn: form.nameBn?.trim(),
        nameEn: form.nameEn?.trim(),
        contactName: form.contactName?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        addressBn: form.addressBn?.trim() || null,
        addressEn: form.addressEn?.trim() || null,
        area: form.area?.trim() || null,
        notesBn: form.notesBn?.trim() || null,
        notesEn: form.notesEn?.trim() || null,
        rating: form.rating,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (mode === "create") return api.post("/admin/suppliers", body);
      return api.patch(`/admin/suppliers/${id}`, body);
    },
    onSuccess: (res: any) => {
      toast.success(t("সংরক্ষিত", "Saved"));
      const supplierId = mode === "create" ? res?.id : id;
      router.push(`/admin/suppliers/${supplierId}`);
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ??
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ??
        t("সংরক্ষণ ব্যর্থ", "Save failed");
      toast.error(msg);
    },
  });

  if (mode === "edit" && loadingExisting) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-ink-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("লোড হচ্ছে...", "Loading...")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {mode === "create"
              ? t("নতুন সরবরাহকারী", "New Supplier")
              : t("সরবরাহকারী সম্পাদনা", "Edit Supplier")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "প্রতিটি অর্ডার আইটেমের জন্য কোন ভেন্ডর থেকে সংগ্রহ করা হলো তা ট্র্যাক করুন",
              "Track which vendor supplied each order item for returns and warranty.",
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("মৌলিক তথ্য", "Basic Info")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label={t("নাম (বাংলা)", "Name (BN)")} required>
            <Input
              value={form.nameBn}
              onChange={(e) => setForm((s) => ({ ...s, nameBn: e.target.value }))}
              placeholder="করিম রাইস হোলসেল"
            />
          </Field>
          <Field label={t("নাম (English)", "Name (EN)")} required>
            <Input
              value={form.nameEn}
              onChange={(e) => setForm((s) => ({ ...s, nameEn: e.target.value }))}
              placeholder="Karim Rice Wholesale"
            />
          </Field>
          <Field
            label={t("স্লাগ (URL)", "Slug (URL)")}
            hint={t(
              "খালি রাখলে নাম থেকে তৈরি হবে",
              "Auto-generated from name if left blank",
            )}
          >
            <Input
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm((s) => ({ ...s, slug: slugify(e.target.value) }));
              }}
              placeholder="karim-rice-wholesale"
            />
          </Field>
          <Field label={t("যোগাযোগের নাম", "Contact name")}>
            <Input
              value={form.contactName}
              onChange={(e) =>
                setForm((s) => ({ ...s, contactName: e.target.value }))
              }
              placeholder="করিম মিয়া"
            />
          </Field>
          <Field label={t("এলাকা", "Area")}>
            <Input
              value={form.area}
              onChange={(e) => setForm((s) => ({ ...s, area: e.target.value }))}
              placeholder="লাকসাম সদর, কুমিল্লা"
            />
          </Field>
          <Field label={t("রেটিং", "Internal Rating")}>
            <RatingPicker
              value={form.rating}
              onChange={(n) => setForm((s) => ({ ...s, rating: n }))}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("যোগাযোগ", "Contact")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label={t("ফোন", "Phone")}>
            <Input
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
              placeholder="01712-345678"
            />
          </Field>
          <Field label={t("ইমেইল", "Email")}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              placeholder="vendor@example.com"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("ঠিকানা", "Address")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label={t("ঠিকানা (বাংলা)", "Address (BN)")}>
            <textarea
              value={form.addressBn}
              onChange={(e) =>
                setForm((s) => ({ ...s, addressBn: e.target.value }))
              }
              rows={2}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-100"
              placeholder="হোল্ডিং ১২, মৌজা-..."
            />
          </Field>
          <Field label={t("ঠিকানা (English)", "Address (EN)")}>
            <textarea
              value={form.addressEn}
              onChange={(e) =>
                setForm((s) => ({ ...s, addressEn: e.target.value }))
              }
              rows={2}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-100"
              placeholder="Holding 12, Mouza-..."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("নোট", "Notes")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label={t("নোট (বাংলা)", "Notes (BN)")}>
            <textarea
              value={form.notesBn}
              onChange={(e) =>
                setForm((s) => ({ ...s, notesBn: e.target.value }))
              }
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-100"
            />
          </Field>
          <Field label={t("নোট (English)", "Notes (EN)")}>
            <textarea
              value={form.notesEn}
              onChange={(e) =>
                setForm((s) => ({ ...s, notesEn: e.target.value }))
              }
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-100"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("সেটিংস", "Settings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field
            label={t("সর্ট অর্ডার", "Sort order")}
            hint={t("কম = আগে দেখায়", "Lower = shown first")}
          >
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  sortOrder: parseInt(e.target.value || "0", 10) || 0,
                }))
              }
            />
          </Field>
          <Field label={t("সক্রিয়?", "Active?")}>
            <label className="mt-1.5 flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((s) => ({ ...s, isActive: e.target.checked }))
                }
                className="h-4 w-4 rounded border-ink-300 text-primary-700"
              />
              <span className="text-sm">
                {t("নতুন অর্ডারে ব্যবহারযোগ্য", "Available for new orders")}
              </span>
            </label>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          {t("বাতিল", "Cancel")}
        </Button>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !form.nameBn || !form.nameEn}
        >
          <Save className="h-4 w-4" />{" "}
          {save.isPending ? t("সংরক্ষণ হচ্ছে...", "Saving...") : t("সংরক্ষণ", "Save")}
        </Button>
      </div>
    </div>
  );
}
