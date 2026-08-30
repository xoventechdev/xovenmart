"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface NewCustomerRow {
  date: string;
  count: number;
}

interface TopCustomer {
  userId: string;
  orders: number;
  spent: number;
  user: { id: string; name: string | null; phone: string; email: string | null } | null;
}

interface Ltv {
  avg: number;
  median: number;
  top10PctThreshold: number;
  sampleSize: number;
}

export default function CustomersReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: newCust } = useQuery({
    queryKey: ["admin", "reports", "customers", "new"],
    queryFn: () => api.get<NewCustomerRow[]>("/admin/reports/customers/new?days=30"),
  });
  const { data: top } = useQuery({
    queryKey: ["admin", "reports", "customers", "top"],
    queryFn: () => api.get<TopCustomer[]>("/admin/reports/customers/top?days=90"),
  });
  const { data: ltv } = useQuery({
    queryKey: ["admin", "reports", "customers", "ltv"],
    queryFn: () => api.get<Ltv>("/admin/reports/customers/lifetime-value"),
  });

  const newRows: NewCustomerRow[] = (newCust ?? []) as any;
  const topRows: TopCustomer[] = (top ?? []) as any;
  const l = (ltv ?? null) as Ltv | null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("গ্রাহক রিপোর্ট", "Customers Report")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("গ্রাহক অর্�ন ও লাইফটাইম মূল্য", "Customer acquisition and lifetime value")}</p>
      </div>

      {l && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Users className="h-4 w-4" />} label={t("নমুনা", "Sample size")} value={l.sampleSize.toLocaleString()} />
          <Stat icon={<TrendingUp className="h-4 w-4" />} label={t("গড় LTV", "Avg LTV")} value={`৳${l.avg.toFixed(2)}`} />
          <Stat icon={<TrendingUp className="h-4 w-4" />} label={t("মধ্যমা LTV", "Median LTV")} value={`৳${l.median.toFixed(2)}`} />
          <Stat icon={<TrendingUp className="h-4 w-4" />} label={t("শীর্ষ ১০% থ্রেশহোল্ড", "Top 10% threshold")} value={`৳${l.top10PctThreshold.toFixed(2)}`} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("নতুন গ্রাহক (দৈনিক)", "New customers (daily)")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
              <tr>
                <th className="h-10 px-4 text-left">{t("তারিখ", "Date")}</th>
                <th className="h-10 px-4 text-right">{t("নতুন গ্রাহক", "New")}</th>
              </tr>
            </thead>
            <tbody>
              {newRows.map((d) => (
                <tr key={d.date} className="border-b border-ink-200 dark:border-ink-300">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Calendar className="mr-1 inline h-3 w-3 text-ink-400" />
                    {d.date}
                  </td>
                  <td className="px-4 py-2 text-right"><Badge variant="muted">{d.count}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("শীর্ষ গ্রাহক (গত ৯০ দিন)", "Top customers (last 90 days)")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন তথ্য নেই", "No data")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                <tr>
                  <th className="h-10 px-4 text-left">{t("গ্রাহক", "Customer")}</th>
                  <th className="h-10 px-4 text-left">{t("ফোন", "Phone")}</th>
                  <th className="h-10 px-4 text-right">{t("অর্ডার", "Orders")}</th>
                  <th className="h-10 px-4 text-right">{t("মোট খরচ", "Total spent")}</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((c) => (
                  <tr key={c.userId} className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2">{c.user?.name ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.user?.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{c.orders}</td>
                    <td className="px-4 py-2 text-right font-semibold">৳{c.spent.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700">{icon}</div>
          <div>
            <div className="text-xs text-ink-500">{label}</div>
            <div className="text-lg font-bold text-ink-900 dark:text-ink-900">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
