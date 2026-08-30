"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface Report {
  from: string;
  to: string;
  total: number;
  count: number;
  byCategory: Record<string, number>;
  topVendors: { name: string; total: number }[];
  comparison: { prevFrom: string; prevTo: string; prevTotal: number; growth: number | null };
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

function monthRange(offset = 0): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() - offset;
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const label = `${yyyy}-${mm}`;
  return {
    from: `${yyyy}-${mm}-01`,
    to: end.toISOString().slice(0, 10),
    label,
  };
}

export default function ExpenseReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [period, setPeriod] = useState<"this" | "last" | "last3" | "custom">("this");
  const [custom, setCustom] = useState({ from: monthRange(0).from, to: monthRange(0).to });

  let from = "";
  let to = "";
  if (period === "this") {
    const r = monthRange(0);
    from = r.from;
    to = r.to;
  } else if (period === "last") {
    const r = monthRange(1);
    from = r.from;
    to = r.to;
  } else if (period === "last3") {
    const r = monthRange(2);
    from = r.from;
    to = monthRange(0).to;
  } else if (period === "custom") {
    from = custom.from;
    to = custom.to;
  }

  const { data: report, isLoading } = useQuery({
    queryKey: ["admin", "expenses", "report", from, to],
    queryFn: () => api.get(`/admin/expenses/report?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });

  const r: Report | null = report ?? null;
  const categoryEntries = r ? Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]) : [];
  const grandTotal = r?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900 dark:text-ink-900">
          <BarChart3 className="h-6 w-6" />
          {t("খরচ রিপোর্ট", "Expense Report")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">{t("সময়কাল অনুযায়ী খরচের বিস্তারিত বিশ্লেষণ", "Period-based expense analysis")}</p>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2">
            <PeriodChip label={t("এই মাস", "This Month")} active={period === "this"} onClick={() => setPeriod("this")} />
            <PeriodChip label={t("গত মাস", "Last Month")} active={period === "last"} onClick={() => setPeriod("last")} />
            <PeriodChip label={t("গত ৩ মাস", "Last 3 Months")} active={period === "last3"} onClick={() => setPeriod("last3")} />
            <PeriodChip label={t("কাস্টম", "Custom")} active={period === "custom"} onClick={() => setPeriod("custom")} />
          </div>
          {period === "custom" && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label={t("থেকে", "From")}>
                <Input type="date" value={custom.from} onChange={(e) => setCustom((s) => ({ ...s, from: e.target.value }))} />
              </Field>
              <Field label={t("পর্যন্ত", "To")}>
                <Input type="date" value={custom.to} onChange={(e) => setCustom((s) => ({ ...s, to: e.target.value }))} />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200" />)}</div>
      ) : r ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-ink-500">{t("মোট", "Total")}</div>
                <div className="text-2xl font-bold">{formatBDT(r.total)}</div>
                <div className="text-xs text-ink-500">{r.count} {t("এন্ট্রি", "entries")}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-ink-500">{t("গত পিরিয়ড", "Previous Period")}</div>
                <div className="text-2xl font-bold">{formatBDT(r.comparison?.prevTotal ?? 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-ink-500">{t("পরিবর্তন", "Growth")}</div>
                <div className="flex items-center gap-1 text-2xl font-bold">
                  {r.comparison?.growth != null ? (
                    r.comparison.growth > 0 ? (
                      <>
                        <TrendingUp className="h-5 w-5 text-danger-700" />
                        <span className="text-danger-700">+{r.comparison.growth.toFixed(1)}%</span>
                      </>
                    ) : r.comparison.growth < 0 ? (
                      <>
                        <TrendingDown className="h-5 w-5 text-success-700" />
                        <span className="text-success-700">{r.comparison.growth.toFixed(1)}%</span>
                      </>
                    ) : (
                      <span>0%</span>
                    )
                  ) : (
                    <span className="text-sm text-ink-500">—</span>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-ink-500">{t("শীর্ষ ক্যাটাগরি", "Top Category")}</div>
                <div className="text-2xl font-bold">
                  {categoryEntries[0] ? t(CATEGORY_LABEL[categoryEntries[0][0]]?.bn ?? categoryEntries[0][0], CATEGORY_LABEL[categoryEntries[0][0]]?.en ?? categoryEntries[0][0]) : "—"}
                </div>
                <div className="text-xs text-ink-500">
                  {categoryEntries[0] ? formatBDT(categoryEntries[0][1]) : ""}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("ক্যাটাগরি অনুযায়ী", "By Category")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoryEntries.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-500">{t("কোন ডেটা নেই", "No data")}</p>
              ) : categoryEntries.map(([cat, amt]) => {
                const cl = CATEGORY_LABEL[cat] ?? { bn: cat, en: cat };
                const pct = grandTotal > 0 ? (amt / grandTotal) * 100 : 0;
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <Badge variant={CATEGORY_VARIANT[cat] ?? "muted"} className="min-w-32 justify-center">{lang === "bn" ? cl.bn : cl.en}</Badge>
                    <div className="flex-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                        <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="min-w-24 text-right text-sm font-semibold">{formatBDT(amt)}</div>
                    <div className="min-w-12 text-right text-xs text-ink-500">{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("শীর্ষ ৫ বিক্রেতা", "Top 5 Vendors")}</CardTitle>
            </CardHeader>
            <CardContent>
              {r.topVendors.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-500">{t("কোন ডেটা নেই", "No data")}</p>
              ) : (
                <ol className="space-y-2">
                  {r.topVendors.map((v, idx) => (
                    <li key={v.name} className="flex items-center justify-between rounded-md border border-ink-200 p-3 dark:border-ink-300">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                          {idx + 1}
                        </span>
                        <span className="font-medium">{v.name}</span>
                      </div>
                      <span className="font-semibold">{formatBDT(v.total)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-ink-500">{t("রিপোর্ট দেখতে একটি পিরিয়ড নির্বাচন করুন", "Select a period to view report")}</p>
      )}
    </div>
  );
}

function PeriodChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant={active ? "default" : "outline"} onClick={onClick}>
      {label}
    </Button>
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