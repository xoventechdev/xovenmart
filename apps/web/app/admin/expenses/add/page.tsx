"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Save, Receipt, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "LOGISTICS", bn: "লজিস্টিক্স", en: "Logistics" },
  { value: "MARKETING", bn: "মার্কেটিং", en: "Marketing" },
  { value: "TECH", bn: "টেক", en: "Tech" },
  { value: "OFFICE", bn: "অফিস", en: "Office" },
  { value: "SALARY", bn: "বেতন", en: "Salary" },
  { value: "PRODUCT_PURCHASE", bn: "পণ্য ক্রয়", en: "Product Purchase" },
  { value: "GOVERNMENT", bn: "সরকারি", en: "Government" },
  { value: "BANK_CHARGES", bn: "ব্যাংক চার্জ", en: "Bank Charges" },
  { value: "REFUND", bn: "রিফান্ড", en: "Refund" },
  { value: "MISC", bn: "বিবিধ", en: "Misc" },
];

const PAYMENT_METHODS = [
  { value: "CASH", bn: "ক্যাশ", en: "CASH" },
  { value: "BKASH", bn: "bKash", en: "bKash" },
  { value: "NAGAD", bn: "Nagad", en: "Nagad" },
  { value: "BANK", bn: "ব্যাংক", en: "BANK" },
  { value: "CARD", bn: "কার্ড", en: "CARD" },
  { value: "OTHER", bn: "অন্যান্য", en: "OTHER" },
];

export default function AddExpensePage() {
  const { lang } = useTheme();
  const router = useRouter();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    category: "LOGISTICS",
    amount: 0,
    paymentMethod: "CASH",
    descriptionBn: "",
    descriptionEn: "",
    vendorName: "",
    receiptUrl: "",
    incurredAt: today,
    notes: "",
  });

  const save = useMutation({
    mutationFn: () => api.post("/admin/expenses", { ...form, amount: Number(form.amount) }),
    onSuccess: () => {
      toast.success(t("খরচ যোগ হয়েছে", "Expense added"));
      router.push("/admin/expenses/all");
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900 dark:text-ink-900">
            <Receipt className="h-6 w-6" />
            {t("নতুন খরচ", "Add Expense")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{t("নতুন ব্যবসায়িক খরচ রেকর্ড করুন", "Record a new business expense")}</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/admin/expenses/all")}>
          <X className="h-4 w-4" /> {t("বাতিল", "Cancel")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("খরচের বিবরণ", "Expense Details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("ক্যাটাগরি", "Category")} required>
              <select
                value={form.category}
                onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{lang === "bn" ? c.bn : c.en}</option>
                ))}
              </select>
            </Field>
            <Field label={t("পরিমাণ (BDT)", "Amount (BDT)")} required>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))} />
            </Field>
            <Field label={t("পেমেন্ট পদ্ধতি", "Payment Method")}>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm((s) => ({ ...s, paymentMethod: e.target.value }))}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>{lang === "bn" ? p.bn : p.en}</option>
                ))}
              </select>
            </Field>
            <Field label={t("বিক্রেতা / ঠিকাদার", "Vendor / Contractor")}>
              <Input value={form.vendorName} onChange={(e) => setForm((s) => ({ ...s, vendorName: e.target.value }))} />
            </Field>
            <Field label={t("খরচের তারিখ", "Incurred Date")} required>
              <Input type="date" value={form.incurredAt} onChange={(e) => setForm((s) => ({ ...s, incurredAt: e.target.value }))} />
            </Field>
            <Field label={t("রসিদ URL (ঐচ্ছিক)", "Receipt URL (optional)")}>
              <Input value={form.receiptUrl} onChange={(e) => setForm((s) => ({ ...s, receiptUrl: e.target.value }))} placeholder="https://..." />
            </Field>
            <Field label={t("বিবরণ (বাংলা)", "Description (BN)")}>
              <Input value={form.descriptionBn} onChange={(e) => setForm((s) => ({ ...s, descriptionBn: e.target.value }))} />
            </Field>
            <Field label={t("বিবরণ (EN)", "Description (EN)")}>
              <Input value={form.descriptionEn} onChange={(e) => setForm((s) => ({ ...s, descriptionEn: e.target.value }))} />
            </Field>
            <Field label={t("নোট", "Notes")} className="md:col-span-2">
              <Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/admin/expenses/all")}>{t("বাতিল", "Cancel")}</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || form.amount <= 0 || !form.category || !form.incurredAt}>
          <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children, required, className }: { label: string; children: React.ReactNode; required?: boolean; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {label} {required && <span className="text-danger-700">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}