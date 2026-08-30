"use client";

import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface CatRow {
  category: string;
  totalThisMonth: number;
  countThisMonth: number;
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

export default function ExpenseCategoriesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "expenses", "categories"],
    queryFn: () => api.get("/admin/expenses/categories"),
  });

  const cats: CatRow[] = data ?? [];
  const grandTotal = cats.reduce((s, c) => s + c.totalThisMonth, 0);
  const totalCount = cats.reduce((s, c) => s + c.countThisMonth, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("খরচ ক্যাটাগরি", "Expense Categories")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("এই মাসে ক্যাটাগরি অনুযায়ী খরচের সারসংক্ষেপ", "This month's expense breakdown by category")}</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-ink-500">{t("এই মাসে মোট", "Total This Month")}</div>
              <div className="text-2xl font-bold">{formatBDT(grandTotal)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-ink-500">{t("মোট এন্ট্রি", "Total Entries")}</div>
              <div className="text-2xl font-bold">{totalCount}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => {
            const cl = CATEGORY_LABEL[c.category] ?? { bn: c.category, en: c.category };
            const pct = grandTotal > 0 ? (c.totalThisMonth / grandTotal) * 100 : 0;
            return (
              <Card key={c.category}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">
                    <Badge variant={CATEGORY_VARIANT[c.category] ?? "muted"}>{lang === "bn" ? cl.bn : cl.en}</Badge>
                  </CardTitle>
                  <Receipt className="h-4 w-4 text-ink-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{formatBDT(c.totalThisMonth)}</div>
                  <div className="mt-1 text-xs text-ink-500">
                    {c.countThisMonth} {t("এন্ট্রি", "entries")} · {pct.toFixed(1)}%
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                    <div
                      className="h-full bg-primary-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}