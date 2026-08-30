"use client";

import { useQuery } from "@tanstack/react-query";
import { Wallet, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface RiderCash {
  total: number;
  riders: { riderId: string; name: string; currentFloat: number }[];
}

export default function CodReconciliationPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reports", "riders", "cash"],
    queryFn: () => api.get<RiderCash>("/admin/reports/riders/cash"),
  });

  const riders = data?.riders ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("ক্যাশ অন ডেলিভারি", "COD Reconciliation")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("রাইডারদের কাছে বকেয়া ক্যাশ", "Outstanding cash held by riders")}</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-warning-100 text-warning-700">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-ink-500">{t("মোট বকেয়া", "Total outstanding")}</div>
              <div className="text-2xl font-bold text-ink-900 dark:text-ink-900">৳{total.toFixed(2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Wallet className="mr-2 inline h-4 w-4" />
            {t("রাইডার অনুযায়ী বকেয়া", "Outstanding by rider")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : riders.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন রাইডার নেই", "No riders")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                <tr>
                  <th className="h-10 px-4 text-left">{t("রাইডার", "Rider")}</th>
                  <th className="h-10 px-4 text-right">{t("বর্তমান ফ্লোট", "Current float")}</th>
                  <th className="h-10 px-4 text-right">{t("অবস্থা", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr key={r.riderId} className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right font-semibold">৳{r.currentFloat.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={r.currentFloat > 0 ? "warning" : "success"}>
                        {r.currentFloat > 0 ? t("বকেয়া", "Outstanding") : t("পরিষ্কার", "Clear")}
                      </Badge>
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
