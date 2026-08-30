"use client";

import { useQuery } from "@tanstack/react-query";
import { Bike, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface RiderPerformance {
  riderId: string;
  name: string;
  totalDeliveries: number;
  successRate: number;
  avgDeliveryTime: number;
  cashCollected: number;
}

export default function RidersReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: riders, isLoading } = useQuery({
    queryKey: ["admin", "reports", "riders", "performance"],
    queryFn: () => api.get<RiderPerformance[]>("/admin/reports/riders/performance?days=30"),
  });

  const list: RiderPerformance[] = (riders ?? []) as any;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("রাইডার পারফরম্যান্স", "Rider Performance")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("গত ৩০ দিনের রাইডার পরিসংখ্যান", "Last 30 days rider stats")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Bike className="mr-2 inline h-4 w-4" />
            {t("রাইডার তালিকা", "Riders")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন তথ্য নেই", "No data")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                <tr>
                  <th className="h-10 px-4 text-left">{t("নাম", "Name")}</th>
                  <th className="h-10 px-4 text-right">{t("ডেলিভারি", "Deliveries")}</th>
                  <th className="h-10 px-4 text-right">{t("সাফল্যের হার", "Success rate")}</th>
                  <th className="h-10 px-4 text-right">{t("গড় সময়", "Avg time (min)")}</th>
                  <th className="h-10 px-4 text-right">{t("সংগৃহীত ক্যাশ", "Cash collected")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.riderId} className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant="muted">{r.totalDeliveries}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={r.successRate >= 90 ? "success" : r.successRate >= 70 ? "warning" : "danger"}>
                        {r.successRate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">{r.avgDeliveryTime.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      <Wallet className="mr-1 inline h-3 w-3 text-ink-400" />৳{r.cashCollected.toFixed(2)}
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
