"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Calendar, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface OrdersReport {
  total: number;
  byStatus: { status: string; count: number }[];
  byPaymentMethod: { method: string; count: number }[];
  daily: { date: string; orders: number }[];
}

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "muted"> = {
  PENDING: "warning",
  ACCEPTED: "info",
  PREPARING: "info",
  PREPARED: "default",
  OUT_FOR_DELIVERY: "default",
  DELIVERED: "success",
  CANCELLED: "danger",
  RETURNED: "warning",
  REFUNDED: "danger",
};

export default function OrdersReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: report, isLoading } = useQuery({
    queryKey: ["admin", "reports", "orders"],
    queryFn: () => api.get<OrdersReport>("/admin/reports/orders?days=30"),
  });

  const r: OrdersReport | null = (report as any) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("অর্ডার রিপোর্ট", "Orders Report")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("স্ট্যাটাস ও পেমেন্ট অনুযায়ী অর্ডার বিশ্লেষণ", "Order analysis by status and payment")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        ))}</div>
      ) : !r ? (
        <Card><CardContent className="py-8 text-center text-sm text-ink-500">{t("কোন তথ্য নেই", "No data")}</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-100 text-primary-700">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-ink-500">{t("মোট অর্ডার (৩০ দিন)", "Total orders (30d)")}</div>
                  <div className="text-2xl font-bold text-ink-900 dark:text-ink-900">{r.total.toLocaleString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("স্�্যাটাস অনুযায়ী", "By status")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.byStatus.length === 0 ? (
                  <p className="text-sm text-ink-500">{t("কিছু নেই", "None")}</p>
                ) : (
                  r.byStatus.map((s) => {
                    const pct = r.total > 0 ? (s.count / r.total) * 100 : 0;
                    return (
                      <div key={s.status} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <Badge variant={STATUS_COLORS[s.status] ?? "muted"}>{s.status}</Badge>
                          <span className="font-mono text-xs text-ink-500">
                            {s.count} ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                          <div className="h-full bg-primary-600" style={{ width: pct + "%" }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("পেমেন্ট পদ্ধতি", "By payment method")}</CardTitle>
              </CardHeader>
              <CardContent>
                {r.byPaymentMethod.length === 0 ? (
                  <p className="text-sm text-ink-500">{t("কিছু নেই", "None")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                      <tr>
                        <th className="h-10 px-4 text-left">{t("পদ্ধতি", "Method")}</th>
                        <th className="h-10 px-4 text-right">{t("সংখ্যা", "Count")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.byPaymentMethod.map((m) => (
                        <tr key={m.method} className="border-b border-ink-200 dark:border-ink-300">
                          <td className="px-4 py-2">
                            <Badge variant="outline">
                              <Wallet className="mr-1 h-3 w-3" /> {m.method}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("দৈনিক (শে� ১৪ দিন)", "Daily (last 14 days)")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                  <tr>
                    <th className="h-10 px-4 text-left">{t("তারিখ", "Date")}</th>
                    <th className="h-10 px-4 text-right">{t("অর্ডার", "Orders")}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.daily.map((d) => (
                    <tr key={d.date} className="border-b border-ink-200 dark:border-ink-300">
                      <td className="px-4 py-2 font-mono text-xs">
                        <Calendar className="mr-1 inline h-3 w-3 text-ink-400" />
                        {d.date}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Badge variant="muted">{d.orders}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
