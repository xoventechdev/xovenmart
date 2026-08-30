"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, X, Save, Receipt, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

interface Expense {
  id: string;
  category: string;
  amount: number;
  paymentMethod: string;
  descriptionBn: string | null;
  descriptionEn: string | null;
  vendorName: string | null;
  receiptUrl: string | null;
  incurredAt: string;
  recordedById: string;
  notes: string | null;
}

const CATEGORY_LABEL: Record<string, { bn: string; en: string }> = {
  LOGISTICS: { bn: "লজিস্টিক্স", en: "Logistics" },
  MARKETING: { bn: "মার্কেটিং", en: "Marketing" },
  TECH: { bn: "টেক", en: "Tech" },
  OFFICE: { bn: "অফিস", en: "Office" },
  SALARY: { bn: "বেতন", en: "Salary" },
  PRODUCT_PURCHASE: { bn: "পণ্য ক্রয়", en: "Product Purchase" },
  GOVERNMENT: { bn: "সরকারি", en: "Government" },
  BANK_CHARGES: { bn: "ব্যাংক চার্জ", en: "Bank Charges" },
  REFUND: { bn: "রিফান্ড", en: "Refund" },
  MISC: { bn: "বিবিধ", en: "Misc" },
};

const CATEGORY_VARIANT: Record<string, any> = {
  LOGISTICS: "info",
  MARKETING: "accent",
  TECH: "default",
  OFFICE: "muted",
  SALARY: "warning",
  PRODUCT_PURCHASE: "info",
  GOVERNMENT: "default",
  BANK_CHARGES: "muted",
  REFUND: "danger",
  MISC: "muted",
};

export default function AllExpensesPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [filters, setFilters] = useState({
    category: "",
    from: "",
    to: "",
    paymentMethod: "",
    page: 1,
    perPage: 25,
  });

  const queryString = [
    filters.category ? `category=${filters.category}` : "",
    filters.from ? `from=${filters.from}` : "",
    filters.to ? `to=${filters.to}` : "",
    filters.paymentMethod ? `paymentMethod=${filters.paymentMethod}` : "",
    `page=${filters.page}`,
    `perPage=${filters.perPage}`,
  ].filter(Boolean).join("&");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "expenses", queryString],
    queryFn: () => api.get(`/admin/expenses?${queryString}`),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["admin", "expenses", "categories"],
    queryFn: () => api.get("/admin/expenses/categories"),
  });

  const { data: summary } = useQuery({
    queryKey: ["admin", "expenses", "summary"],
    queryFn: () => api.get("/admin/expenses/summary"),
  });

  const items: Expense[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.perPage));

  const cats: { category: string; totalThisMonth: number; countThisMonth: number }[] = categoriesData ?? [];
  const topCategory = cats.slice().sort((a, b) => b.totalThisMonth - a.totalThisMonth)[0];

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/expenses/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "expenses"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("সব খরচ", "All Expenses")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("ব্যবসায়িক সকল খরচের হিসাব", "Track all business expenses")}</p>
        </div>
        <Button asChild>
          <Link href="/admin/expenses/add">
            <Plus className="h-4 w-4" /> {t("নতুন খরচ", "Add Expense")}
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label={t("এই মাসে মোট", "This Month Total")} value={formatBDT(summary?.thisMonth ?? 0)} color="bg-primary-100 text-primary-700" />
        <StatCard label={t("গত মাসে", "Last Month")} value={formatBDT(summary?.lastMonth ?? 0)} color="bg-info-100 text-info-700" />
        <StatCard
          label={t("শীর্ষ ক্যাটাগরি", "Top Category")}
          value={topCategory ? t(CATEGORY_LABEL[topCategory.category]?.bn ?? topCategory.category, CATEGORY_LABEL[topCategory.category]?.en ?? topCategory.category) : "—"}
          subValue={topCategory ? formatBDT(topCategory.totalThisMonth) : ""}
          color="bg-warning-100 text-warning-700"
        />
        <StatCard label={t("মোট এন্ট্রি", "Total Entries")} value={String(total)} color="bg-success-100 text-success-700" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-900">
            <Filter className="h-4 w-4" /> {t("ফিল্টার", "Filters")}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs text-ink-500">{t("ক্যাটাগরি", "Category")}</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters((s) => ({ ...s, category: e.target.value, page: 1 }))}
                className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                <option value="">{t("সব", "All")}</option>
                {Object.keys(CATEGORY_LABEL).map((k) => (
                  <option key={k} value={k}>{lang === "bn" ? CATEGORY_LABEL[k].bn : CATEGORY_LABEL[k].en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-500">{t("থেকে", "From")}</label>
              <Input type="date" value={filters.from} onChange={(e) => setFilters((s) => ({ ...s, from: e.target.value, page: 1 }))} />
            </div>
            <div>
              <label className="text-xs text-ink-500">{t("পর্যন্ত", "To")}</label>
              <Input type="date" value={filters.to} onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value, page: 1 }))} />
            </div>
            <div>
              <label className="text-xs text-ink-500">{t("পেমেন্ট", "Payment")}</label>
              <select
                value={filters.paymentMethod}
                onChange={(e) => setFilters((s) => ({ ...s, paymentMethod: e.target.value, page: 1 }))}
                className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                <option value="">{t("সব", "All")}</option>
                <option value="CASH">{t("ক্যাশ", "CASH")}</option>
                <option value="BKASH">bKash</option>
                <option value="NAGAD">Nagad</option>
                <option value="BANK">{t("ব্যাংক", "BANK")}</option>
                <option value="CARD">{t("কার্ড", "CARD")}</option>
                <option value="OTHER">{t("অন্যান্য", "OTHER")}</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন খরচ নেই", "No expenses yet")}</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="border-b border-ink-200 dark:border-ink-300">
                  <tr className="text-left text-xs text-ink-500">
                    <th className="p-2">{t("তারিখ", "Date")}</th>
                    <th className="p-2">{t("ক্যাটাগরি", "Category")}</th>
                    <th className="p-2">{t("বিবরণ", "Description")}</th>
                    <th className="p-2">{t("পরিমাণ", "Amount")}</th>
                    <th className="p-2">{t("পেমেন্ট", "Payment")}</th>
                    <th className="p-2">{t("বিক্রেতা", "Vendor")}</th>
                    <th className="p-2">{t("অ্যাকশন", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const cl = CATEGORY_LABEL[e.category] ?? { bn: e.category, en: e.category };
                    return (
                      <tr key={e.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-200">
                        <td className="p-2 text-xs">{new Date(e.incurredAt).toLocaleDateString()}</td>
                        <td className="p-2"><Badge variant={CATEGORY_VARIANT[e.category] ?? "muted"}>{lang === "bn" ? cl.bn : cl.en}</Badge></td>
                        <td className="p-2 max-w-xs truncate">{(lang === "bn" ? e.descriptionBn : e.descriptionEn) ?? e.descriptionEn ?? e.descriptionBn ?? "—"}</td>
                        <td className="p-2 font-semibold">{formatBDT(e.amount)}</td>
                        <td className="p-2 text-xs">{e.paymentMethod}</td>
                        <td className="p-2 text-xs">{e.vendorName ?? "—"}</td>
                        <td className="p-2">
                          <Button size="icon" variant="ghost" onClick={() => { if (confirm(t("মুছবেন?", "Delete?"))) remove.mutate(e.id); }}>
                            <Trash2 className="h-4 w-4 text-danger-700" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                  <span>{t(`মোট ${total} এন্ট্রি`, `${total} total`)}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={filters.page <= 1} onClick={() => setFilters((s) => ({ ...s, page: s.page - 1 }))}>
                      {t("পূর্ববর্তী", "Prev")}
                    </Button>
                    <span className="px-2 py-1">{filters.page} / {totalPages}</span>
                    <Button size="sm" variant="outline" disabled={filters.page >= totalPages} onClick={() => setFilters((s) => ({ ...s, page: s.page + 1 }))}>
                      {t("পরবর্তী", "Next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, subValue, color }: { label: string; value: string; subValue?: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          <Receipt className="h-4 w-4" />
        </div>
        <div className="text-xl font-bold">{value}</div>
        {subValue && <div className="text-sm font-semibold text-ink-700">{subValue}</div>}
        <div className="text-xs text-ink-500">{label}</div>
      </CardContent>
    </Card>
  );
}