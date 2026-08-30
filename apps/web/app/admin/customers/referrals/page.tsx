"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Gift,
  Users,
  Clock,
  Award,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface Referral {
  id: string;
  referrer: { id: string; name: string | null; phone: string };
  referee: { id: string; name: string | null; phone: string };
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  rewardedAt: string | null;
}

const STATUS_FILTERS: Array<{ key: "ALL" | Referral["status"]; labelBn: string; labelEn: string }> = [
  { key: "ALL", labelBn: "সব", labelEn: "All" },
  { key: "PENDING", labelBn: "বিচারাধীন", labelEn: "Pending" },
  { key: "QUALIFIED", labelBn: "যোগ্য", labelEn: "Qualified" },
  { key: "REWARDED", labelBn: "পুরস্কৃত", labelEn: "Rewarded" },
  { key: "EXPIRED", labelBn: "মেয়াদোত্তীর্ণ", labelEn: "Expired" },
];

export default function ReferralsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [filter, setFilter] = useState<"ALL" | Referral["status"]>("ALL");

  const params = new URLSearchParams();
  if (filter !== "ALL") params.set("status", filter);
  params.set("perPage", "200");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "referrals", filter],
    queryFn: () => api.get<{ items: Referral[]; total: number }>(`/admin/customers/referrals?${params.toString()}`),
  });

  // Stats
  const allParams = new URLSearchParams();
  allParams.set("perPage", "1000");
  const { data: allData } = useQuery({
    queryKey: ["admin", "referrals", "all-stats"],
    queryFn: () => api.get<{ items: Referral[]; total: number }>(`/admin/customers/referrals?${allParams.toString()}`),
  });

  const { data: rewardsData } = useQuery({
    queryKey: ["admin", "referral-rewards", "stats"],
    queryFn: () => api.get<{ items: any[]; total: number }>("/admin/customers/referrals/rewards?perPage=1000"),
  });

  const stats = useMemo(() => {
    const all: Referral[] = allData?.items ?? [];
    const rewards: any[] = rewardsData?.items ?? [];
    return {
      total: all.length,
      rewarded: all.filter((r) => r.status === "REWARDED").length,
      pending: all.filter((r) => r.status === "PENDING").length,
      rewardAmount: rewards.reduce((s, r) => s + Number(r.rewardAmount ?? 0), 0),
    };
  }, [allData, rewardsData]);

  const items: Referral[] = data?.items ?? [];

  const statusBadge = (status: Referral["status"]) => {
    const variants: Record<Referral["status"], any> = {
      PENDING: "warning",
      QUALIFIED: "info",
      REWARDED: "success",
      EXPIRED: "muted",
      CANCELLED: "danger",
    };
    const labels: Record<Referral["status"], { bn: string; en: string }> = {
      PENDING: { bn: "বিচারাধীন", en: "Pending" },
      QUALIFIED: { bn: "যোগ্য", en: "Qualified" },
      REWARDED: { bn: "পুরস্কৃত", en: "Rewarded" },
      EXPIRED: { bn: "মেয়াদোত্তীর্ণ", en: "Expired" },
      CANCELLED: { bn: "বাতিল", en: "Cancelled" },
    };
    return <Badge variant={variants[status]}>{t(labels[status].bn, labels[status].en)}</Badge>;
  };

  const cards = [
    { label: t("মোট রেফারেল", "Total Referrals"), value: stats.total, icon: Users, color: "text-primary-700 bg-primary-100" },
    { label: t("পুরস্কৃত", "Rewarded"), value: stats.rewarded, icon: Award, color: "text-success-700 bg-success-100" },
    { label: t("বিচারাধীন", "Pending"), value: stats.pending, icon: Clock, color: "text-warning-700 bg-warning-100" },
    { label: t("মোট পুরস্কার", "Total Reward Issued"), value: `৳${stats.rewardAmount.toFixed(2)}`, icon: Gift, color: "text-info-700 bg-info-100" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("রেফারেল", "Referrals")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("রেফারেল প্রোগ্রাম পরিচালনা করুন", "Manage the referral program")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-md ${s.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-ink-500">{s.label}</div>
                  <div className="text-xl font-bold text-ink-900 dark:text-ink-900">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-1 rounded-md border border-ink-200 bg-white p-1 dark:border-ink-300 dark:bg-ink-50">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={`rounded px-3 py-1 text-sm font-medium ${filter === s.key ? "bg-primary-100 text-primary-700" : "text-ink-600 hover:bg-ink-100"}`}
              >
                {t(s.labelBn, s.labelEn)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("রেফারেল তালিকা", "Referrals List")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন রেফারেল নেই", "No referrals")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-50 text-left text-xs font-semibold uppercase text-ink-700 dark:bg-ink-200">
                  <tr>
                    <th className="px-4 py-2">{t("রেফারার", "Referrer")}</th>
                    <th className="px-4 py-2">{t("রেফারি", "Referee")}</th>
                    <th className="px-4 py-2">{t("অবস্থা", "Status")}</th>
                    <th className="px-4 py-2">{t("তৈরি", "Created")}</th>
                    <th className="px-4 py-2">{t("পুরস্কৃত", "Rewarded")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-200">
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.referrer.name ?? "—"}</div>
                        <div className="font-mono text-xs text-ink-500">{r.referrer.phone}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{r.referee.name ?? "—"}</div>
                        <div className="font-mono text-xs text-ink-500">{r.referee.phone}</div>
                      </td>
                      <td className="px-4 py-2">{statusBadge(r.status)}</td>
                      <td className="px-4 py-2 text-sm text-ink-500">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-sm text-ink-500">
                        {r.rewardedAt ? new Date(r.rewardedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}