"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket,
  Plus,
  ArrowLeft,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface Coupon {
  id: string;
  code: string;
  type: "PERCENT" | "FLAT" | "FREE_DELIVERY";
  value: number;
  scope: "ALL" | "SPECIFIC_PRODUCTS" | "SPECIFIC_CATEGORIES";
  minOrder: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  usagePerUserLimit: number;
  usedCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  descriptionBn: string | null;
  descriptionEn: string | null;
}

export default function ActiveCouponsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");

  // Fetch full list and filter client-side (controller's /active endpoint also works but
  // gives less metadata than /all). Prefer /all for richer row data.
  const { data: coupons, isLoading } = useQuery({
    queryKey: ["admin", "coupons", "active"],
    queryFn: () => api.get("/admin/coupons/all"),
  });

  const list: Coupon[] = (coupons ?? []) as any;

  const now = Date.now();
  const active = useMemo(
    () =>
      list.filter((c) => {
        const starts = new Date(c.startsAt).getTime();
        const ends = new Date(c.endsAt).getTime();
        const inWindow = c.isActive && starts <= now && ends >= now;
        const notExhausted = c.usageLimit == null || c.usedCount < c.usageLimit;
        return inWindow && notExhausted;
      }),
    [list, now],
  );

  const filtered = active.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.code.toLowerCase().includes(q);
  });

  // Aggregate stats
  const totalUsage = active.reduce((s, c) => s + (c.usedCount ?? 0), 0);
  const avgUtilization = active.length === 0
    ? 0
    : active.reduce((s, c) => {
        if (!c.usageLimit) return s;
        return s + Math.min(100, (c.usedCount / c.usageLimit) * 100);
      }, 0) / Math.max(1, active.filter((c) => c.usageLimit != null).length);
  const expiringSoon = active.filter((c) => {
    const ends = new Date(c.endsAt).getTime();
    return ends - now < 1000 * 60 * 60 * 24 * 7; // 7 days
  }).length;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/coupons"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("কুপন তালিকায়", "Back to coupons")}
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
              {t("সক্রিয় কুপন", "Active Coupons")}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              {t(
                "এই মুহূর্তে চালু আছে এমন কুপনসমূহ",
                "Coupons currently valid and accepting redemptions",
              )}
            </p>
          </div>
          <Link href="/admin/coupons/create">
            <Button>
              <Plus className="h-4 w-4" /> {t("নতুন কুপন", "Create Coupon")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={<Ticket className="h-5 w-5" />} tone="success" label={t("চলমান কুপন", "Currently Active")} value={active.length} />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} tone="primary" label={t("মোট ব্যবহৃত", "Total Uses")} value={totalUsage} />
        <StatCard icon={<CalendarClock className="h-5 w-5" />} tone="warning" label={t("৭ দিনের মধ্যে শেষ হবে", "Expiring in 7 days")} value={expiringSoon} />
      </div>

      <Card>
        <CardContent className="p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("কোড দিয়ে খুঁজুন...", "Search by code...")}
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> {t("সক্রিয় কুপন তালিকা", "Active Coupon List")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {t("কোন সক্রিয় কুপন নেই", "No active coupons")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-700 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("কোড", "Code")}</th>
                    <th className="px-3 py-2 text-left">{t("ধরন", "Type")}</th>
                    <th className="px-3 py-2 text-right">{t("মূল্য", "Value")}</th>
                    <th className="px-3 py-2 text-right">{t("ব্যবহার", "Usage")}</th>
                    <th className="px-3 py-2 text-right">{t("ন্যূনতম অর্ডার", "Min Order")}</th>
                    <th className="px-3 py-2 text-left">{t("বাকি সময়", "Time Left")}</th>
                    <th className="px-3 py-2 text-left">{t("শেষ", "Ends")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const remaining = usagePercent(c.usedCount, c.usageLimit);
                    const daysLeft = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - now) / (1000 * 60 * 60 * 24)));
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                      >
                        <td className="px-3 py-2">
                          <span className="font-mono font-semibold">{c.code}</span>
                          {c.firstOrderOnly && (
                            <Badge variant="info" className="ml-2 text-[10px]">
                              {t("১ম অর্ডার", "1st order")}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <TypeBadge type={c.type} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.type === "PERCENT"
                            ? `${c.value}%`
                            : c.type === "FREE_DELIVERY"
                            ? "—"
                            : `৳${c.value.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="text-xs tabular-nums">
                            {c.usedCount}
                            {c.usageLimit != null ? ` / ${c.usageLimit}` : " / ∞"}
                          </div>
                          {c.usageLimit != null && (
                            <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-200">
                              <div
                                className={`h-full ${remaining > 80 ? "bg-danger-500" : remaining > 50 ? "bg-warning-500" : "bg-success-500"}`}
                                style={{ width: `${remaining}%` }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ৳{c.minOrder.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {daysLeft <= 3 ? (
                            <Badge variant="danger">{daysLeft} {t("দিন", "d")}</Badge>
                          ) : daysLeft <= 7 ? (
                            <Badge variant="warning">{daysLeft} {t("দিন", "d")}</Badge>
                          ) : (
                            <Badge variant="muted">{daysLeft} {t("দিন", "d")}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-500">
                          {formatDate(c.endsAt, lang)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TypeBadge({ type }: { type: Coupon["type"] }) {
  const map: Record<Coupon["type"], { bn: string; en: string; variant: "default" | "success" | "info" }> = {
    PERCENT: { bn: "শতাংশ", en: "Percent", variant: "default" },
    FLAT: { bn: "ফ্ল্যাট", en: "Flat", variant: "success" },
    FREE_DELIVERY: { bn: "ফ্রি ডেলিভারি", en: "Free Delivery", variant: "info" },
  };
  const { lang } = useTheme();
  return <Badge variant={map[type].variant}>{lang === "bn" ? map[type].bn : map[type].en}</Badge>;
}

function usagePercent(used: number, limit: number | null): number {
  if (limit == null || limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: "primary" | "warning" | "danger" | "success" | "info";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100",
    warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
    success: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-100",
    info: "bg-info-100 text-info-700 dark:bg-info-500/20 dark:text-info-100",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${tones[tone]}`}>{icon}</div>
        <div>
          <div className="text-xs uppercase text-ink-500">{label}</div>
          <div className="text-xl font-bold text-ink-900 dark:text-ink-900">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(s: string, lang: "bn" | "en") {
  try {
    const d = new Date(s);
    return d.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}