"use client";

import { useQuery } from "@tanstack/react-query";
import { Wallet, AlertCircle, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface MethodBreakdown {
  method: string;
  count: number;
  amount: number;
  share: number;
}

interface Pending {
  count: number;
  totalAmount: number;
}

interface CodOutstanding {
  count: number;
  totalAmount: number;
}

export default function PaymentsReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: methods } = useQuery({
    queryKey: ["admin", "reports", "payments", "methods"],
    queryFn: () => api.get<MethodBreakdown[]>("/admin/reports/payments/methods?days=30"),
  });
  const { data: pending } = useQuery({
    queryKey: ["admin", "reports", "payments", "pending"],
    queryFn: () => api.get<Pending>("/admin/reports/payments/pending"),
  });
  const { data: cod } = useQuery({
    queryKey: ["admin", "reports", "payments", "cod-outstanding"],
    queryFn: () => api.get<CodOutstanding>("/admin/reports/payments/cod-outstanding"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("পেমেন্ট রিপোর্ট", "Payments Report")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("পেমেন্ট পদ্ধতি ও বকেয়া পরিসংখ্যান", "Payment methods and outstanding stats")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<AlertCircle className="h-4 w-4" />}
          label={t("যা�াই বাকি", "Pending")}
          value={pending?.count?.toLocaleString() ?? "—"}
          sub={pending ? `৳${pending.totalAmount.toFixed(2)}` : undefined}
          tone="warning"
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label={t("COD বকেয়া", "COD outstanding")}
          value={cod?.count?.toLocaleString() ?? "—"}
          sub={cod ? `৳${cod.totalAmount.toFixed(2)}` : undefined}
          tone="danger"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Wallet className="mr-2 inline h-4 w-4" />
            {t("পেমেন্ট পদ্ধতি (গত ৩০ দিন)", "Payment methods (last 30 days)")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!methods || (methods as MethodBreakdown[]).length === 0) ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন তথ্য নেই", "No data")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                <tr>
                  <th className="h-10 px-4 text-left">{t("পদ্ধতি", "Method")}</th>
                  <th className="h-10 px-4 text-right">{t("লেনদেন", "Count")}</th>
                  <th className="h-10 px-4 text-right">{t("পরিমাণ", "Amount")}</th>
                  <th className="h-10 px-4 text-right">{t("শতাংশ", "Share")}</th>
                </tr>
              </thead>
              <tbody>
                {(methods as MethodBreakdown[]).map((m) => (
                  <tr key={m.method} className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2">
                      <Badge variant="outline">{m.method}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">{m.count}</td>
                    <td className="px-4 py-2 text-right font-semibold">৳{m.amount.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                          <div className="h-full bg-primary-600" style={{ width: m.share + "%" }} />
                        </div>
                        <span className="text-xs text-ink-500">{m.share.toFixed(1)}%</span>
                      </div>
                    </td>
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

function Stat({
  icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "warning" | "danger" | "success";
}) {
  const colors: Record<string, string> = {
    primary: "bg-primary-100 text-primary-700",
    warning: "bg-warning-100 text-warning-700",
    danger: "bg-danger-100 text-danger-700",
    success: "bg-success-100 text-success-700",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={"flex h-9 w-9 items-center justify-center rounded " + colors[tone]}>{icon}</div>
          <div>
            <div className="text-xs text-ink-500">{label}</div>
            <div className="text-lg font-bold text-ink-900 dark:text-ink-900">{value}</div>
            {sub && <div className="text-xs text-ink-500">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
