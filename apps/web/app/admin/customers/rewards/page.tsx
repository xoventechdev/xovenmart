"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, RefreshCw, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface RewardRow {
  id: string;
  rewardAmount: number;
  couponCode: string;
  issuedAt: string;
  redeemedAt: string | null;
  user: { id: string; name: string | null; phone: string };
  referral: {
    referrer: { id: string; name: string | null; phone: string };
    referee: { id: string; name: string | null; phone: string };
  };
}

export default function RewardsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [page, setPage] = useState(1);
  const perPage = 50;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("perPage", String(perPage));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "referral-rewards", page],
    queryFn: () => api.get<{ items: RewardRow[]; total: number }>(`/admin/customers/referrals/rewards?${params.toString()}`),
  });

  const items: RewardRow[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const totalIssued = items.reduce((s, r) => s + Number(r.rewardAmount), 0);
  const totalRedeemed = items.filter((r) => r.redeemedAt).reduce((s, r) => s + Number(r.rewardAmount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("রেফারেল পুরস্কার", "Referral Rewards")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("প্রদত্ত রেফারেল পুরস্কারের তালিকা", "List of issued referral rewards")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-100 text-primary-700">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-ink-500">{t("মোট পুরস্কার", "Total Issued")}</div>
              <div className="text-xl font-bold text-ink-900 dark:text-ink-900">{total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-success-100 text-success-700">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-ink-500">{t("ব্যবহৃত", "Redeemed")}</div>
              <div className="text-xl font-bold text-ink-900 dark:text-ink-900">
                ৳{totalRedeemed.toFixed(2)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning-100 text-warning-700">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-ink-500">{t("মোট পরিমাণ", "Total Amount")}</div>
              <div className="text-xl font-bold text-ink-900 dark:text-ink-900">
                ৳{totalIssued.toFixed(2)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("পুরস্কার তালিকা", "Rewards List")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন পুরস্কার নেই", "No rewards yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-50 text-left text-xs font-semibold uppercase text-ink-700 dark:bg-ink-200">
                  <tr>
                    <th className="px-4 py-2">{t("প্রাপক", "Recipient")}</th>
                    <th className="px-4 py-2">{t("রেফারার", "Referrer")}</th>
                    <th className="px-4 py-2 text-right">{t("পরিমাণ", "Amount")}</th>
                    <th className="px-4 py-2">{t("কুপন কোড", "Coupon Code")}</th>
                    <th className="px-4 py-2">{t("প্রদানের তারিখ", "Issued")}</th>
                    <th className="px-4 py-2">{t("ব্যবহৃত", "Redeemed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-200">
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.user.name ?? "—"}</div>
                        <div className="font-mono text-xs text-ink-500">{r.user.phone}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm">{r.referral.referrer.name ?? "—"}</div>
                        <div className="font-mono text-xs text-ink-500">{r.referral.referrer.phone}</div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">৳{Number(r.rewardAmount).toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.couponCode}</td>
                      <td className="px-4 py-2 text-sm text-ink-500">
                        {new Date(r.issuedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        {r.redeemedAt ? (
                          <Badge variant="success">{new Date(r.redeemedAt).toLocaleDateString()}</Badge>
                        ) : (
                          <Badge variant="muted">{t("অপেক্ষমাণ", "Pending")}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-500">
            {t(`পৃষ্ঠা ${page} / ${totalPages}`, `Page ${page} of ${totalPages}`)}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t("আগের", "Prev")}
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              {t("পরের", "Next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}