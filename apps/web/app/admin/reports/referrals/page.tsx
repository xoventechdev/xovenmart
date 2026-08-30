"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, ArrowRight, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface ReferralFunnel {
  invited: number;
  registered: number;
  ordered: number;
  rewarded: number;
  conversion: {
    invitedToRegistered: number;
    registeredToOrdered: number;
    orderedToRewarded: number;
  };
}

export default function ReferralsReportPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reports", "referrals"],
    queryFn: () => api.get<ReferralFunnel>("/admin/reports/referrals"),
  });

  const f = (data as ReferralFunnel | undefined) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("রেফারেল রিপোর্ট", "Referrals Report")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("রেফারেল ফানেল পরিসংখ্যান", "Referral funnel statistics")}</p>
      </div>

      {isLoading || !f ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        ))}</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <FunnelStep
              step={1}
              label={t("আমন্ত্রিত", "Invited")}
              count={f.invited}
              tone="info"
            />
            <FunnelStep
              step={2}
              label={t("নিবন্ধিত", "Registered")}
              count={f.registered}
              conversion={f.conversion.invitedToRegistered}
              tone="primary"
            />
            <FunnelStep
              step={3}
              label={t("অর্ডার করেছে", "Ordered")}
              count={f.ordered}
              conversion={f.conversion.registeredToOrdered}
              tone="warning"
            />
            <FunnelStep
              step={4}
              label={t("পুরস্কৃত", "Rewarded")}
              count={f.rewarded}
              conversion={f.conversion.orderedToRewarded}
              tone="success"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                <TrendingUp className="mr-2 inline h-4 w-4" />
                {t("রূপান্তর হার", "Conversion rates")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-500 dark:bg-ink-200">
                  <tr>
                    <th className="h-10 px-4 text-left">{t("ধাপ", "Stage")}</th>
                    <th className="h-10 px-4 text-right">{t("হার", "Rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2">{t("আমন্ত্রিত → নিবন্ধিত", "Invited → Registered")}</td>
                    <td className="px-4 py-2 text-right font-semibold">{f.conversion.invitedToRegistered.toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2">{t("নিবন্ধিত → অর্ডার", "Registered → Ordered")}</td>
                    <td className="px-4 py-2 text-right font-semibold">{f.conversion.registeredToOrdered.toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b border-ink-200 dark:border-ink-300">
                    <td className="px-4 py-2">{t("অর্ডার → পুরস্কৃত", "Ordered → Rewarded")}</td>
                    <td className="px-4 py-2 text-right font-semibold">{f.conversion.orderedToRewarded.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FunnelStep({
  step,
  label,
  count,
  conversion,
  tone,
}: {
  step: number;
  label: string;
  count: number;
  conversion?: number;
  tone: "info" | "primary" | "warning" | "success";
}) {
  const colors: Record<string, string> = {
    info: "bg-info-100 text-info-700",
    primary: "bg-primary-100 text-primary-700",
    warning: "bg-warning-100 text-warning-700",
    success: "bg-success-100 text-success-700",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={"flex h-10 w-10 items-center justify-center rounded " + colors[tone]}>
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <Badge variant="muted" className="px-1.5 py-0 text-[10px]">{step}</Badge>
              {label}
            </div>
            <div className="text-2xl font-bold text-ink-900 dark:text-ink-900">{count.toLocaleString()}</div>
            {conversion !== undefined && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                <ArrowRight className="h-3 w-3" />
                {conversion.toFixed(1)}% {("conversion")}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
