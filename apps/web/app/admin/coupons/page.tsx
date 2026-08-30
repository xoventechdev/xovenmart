"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ticket,
  Plus,
  Pencil,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  CalendarClock,
  TrendingUp,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

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
  bannerImageUrl: string | null;
  ordersWithCoupon: number;
  discountGiven: number;
  _count?: { products: number; categories: number; orders: number };
}

type FilterTab = "all" | "active" | "expired" | "exhausted";

export default function CouponsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["admin", "coupons", "all"],
    queryFn: () => api.get("/admin/coupons/all"),
  });

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/coupons/update/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/coupons/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Removed"));
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api.post(`/admin/coupons/${id}/duplicate`),
    onSuccess: () => {
      toast.success(t("কপি তৈরি হয়েছে", "Coupon duplicated"));
      qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  const list: Coupon[] = (coupons ?? []) as any;

  // Compute status for each coupon
  const enriched = useMemo(() => {
    const now = Date.now();
    return list.map((c) => {
      const endsAt = new Date(c.endsAt).getTime();
      const startsAt = new Date(c.startsAt).getTime();
      const expired = endsAt < now;
      const notStarted = startsAt > now;
      const exhausted = c.usageLimit != null && c.usedCount >= c.usageLimit;
      let status: "active" | "expired" | "exhausted" | "inactive" | "scheduled";
      if (!c.isActive) status = "inactive";
      else if (notStarted) status = "scheduled";
      else if (exhausted) status = "exhausted";
      else if (expired) status = "expired";
      else status = "active";
      return { ...c, computedStatus: status };
    });
  }, [list]);

  // Filter by tab
  const filtered = enriched.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesQ = !q || c.code.toLowerCase().includes(q);
    if (!matchesQ) return false;
    if (tab === "all") return true;
    if (tab === "active") return c.computedStatus === "active";
    if (tab === "expired") return c.computedStatus === "expired";
    if (tab === "exhausted") return c.computedStatus === "exhausted";
    return true;
  });

  // Stats
  const activeCount = enriched.filter((c) => c.computedStatus === "active").length;
  const expiredCount = enriched.filter((c) => c.computedStatus === "expired").length;
  const usedThisMonth = enriched.reduce((s, c) => s + (c.usedCount ?? 0), 0);
  const totalRedemptions = enriched.reduce((s, c) => s + (c.ordersWithCoupon ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("সব কুপন", "All Coupons")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("ডিসকাউন্ট কুপন তৈরি, সম্পাদনা ও পরিচালনা করুন", "Create, edit and manage discount coupons")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/coupons/active">
            <Button variant="outline">
              <CheckCircle className="h-4 w-4" /> {t("সক্রিয়", "Active")}
            </Button>
          </Link>
          <Link href="/admin/coupons/redemptions">
            <Button variant="outline">
              <TrendingUp className="h-4 w-4" /> {t("ব্যবহার", "Redemptions")}
            </Button>
          </Link>
          <Link href="/admin/coupons/create">
            <Button>
              <Plus className="h-4 w-4" /> {t("নতুন কুপন", "Create Coupon")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<CheckCircle className="h-5 w-5" />} tone="success" label={t("সক্রিয় কুপন", "Active Coupons")} value={activeCount} />
        <StatCard icon={<CalendarClock className="h-5 w-5" />} tone="warning" label={t("মেয়াদোত্তীর্ণ", "Expired")} value={expiredCount} />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} tone="primary" label={t("এই মাসে ব্যবহৃত", "Used This Month")} value={usedThisMonth} />
        <StatCard icon={<Ticket className="h-5 w-5" />} tone="info" label={t("মোট ব্যবহার", "Total Redemptions")} value={totalRedemptions} />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("কোড দিয়ে খুঁজুন...", "Search by code...")}
              className="max-w-xs"
            />
            <div className="flex items-center gap-1 rounded-md border border-ink-200 bg-white p-0.5 dark:border-ink-300 dark:bg-ink-50">
              <FilterPill active={tab === "all"} onClick={() => setTab("all")}>
                {t("সব", "All")}
              </FilterPill>
              <FilterPill active={tab === "active"} onClick={() => setTab("active")}>
                {t("সক্রিয়", "Active")}
              </FilterPill>
              <FilterPill active={tab === "expired"} onClick={() => setTab("expired")}>
                {t("মেয়াদোত্তীর্ণ", "Expired")}
              </FilterPill>
              <FilterPill active={tab === "exhausted"} onClick={() => setTab("exhausted")}>
                {t("শেষ", "Exhausted")}
              </FilterPill>
            </div>
            <span className="ml-auto text-sm text-ink-500">
              {filtered.length} {t("টি", "items")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> {t("কুপন তালিকা", "Coupon List")}
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
              {t("কোন কুপন নেই", "No coupons")}
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
                    <th className="px-3 py-2 text-left">{t("অবস্থা", "Status")}</th>
                    <th className="px-3 py-2 text-left">{t("শুরু", "Starts")}</th>
                    <th className="px-3 py-2 text-left">{t("শেষ", "Ends")}</th>
                    <th className="px-3 py-2 text-right">{t("কর্ম", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{c.code}</span>
                          {c.firstOrderOnly && (
                            <Badge variant="info" className="text-[10px]">
                              {t("প্রথম অর্ডার", "1st order")}
                            </Badge>
                          )}
                        </div>
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
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {c.usedCount}
                        {c.usageLimit != null ? ` / ${c.usageLimit}` : " / ∞"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ৳{c.minOrder.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={c.computedStatus} />
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-500">
                        {formatDate(c.startsAt, lang)}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-500">
                        {formatDate(c.endsAt, lang)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicate.mutate(c.id)}
                            disabled={duplicate.isPending}
                            title={t("কপি", "Duplicate")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              toggleActive.mutate({ id: c.id, isActive: !c.isActive })
                            }
                            disabled={toggleActive.isPending}
                            title={c.isActive ? t("নিষ্ক্রিয়", "Deactivate") : t("সক্রিয়", "Activate")}
                          >
                            {c.isActive ? (
                              <XCircle className="h-4 w-4 text-warning-700" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-success-700" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (
                                confirm(
                                  t(
                                    `"${c.code}" কুপন মুছে/নিষ্ক্রিয় করবেন?`,
                                    `Soft-delete coupon "${c.code}"?`,
                                  ),
                                )
                              )
                                remove.mutate(c.id);
                            }}
                            disabled={remove.isPending}
                            title={t("মুছুন", "Delete")}
                          >
                            <Trash2 className="h-4 w-4 text-danger-700" />
                          </Button>
                        </div>
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

function TypeBadge({ type }: { type: Coupon["type"] }) {
  const map: Record<Coupon["type"], { bn: string; en: string; variant: "default" | "success" | "info" }> = {
    PERCENT: { bn: "শতাংশ", en: "Percent", variant: "default" },
    FLAT: { bn: "ফ্ল্যাট", en: "Flat", variant: "success" },
    FREE_DELIVERY: { bn: "ফ্রি ডেলিভারি", en: "Free Delivery", variant: "info" },
  };
  const { lang } = useTheme();
  return (
    <Badge variant={map[type].variant}>
      {lang === "bn" ? map[type].bn : map[type].en}
    </Badge>
  );
}

function StatusBadge({ status }: { status: "active" | "expired" | "exhausted" | "inactive" | "scheduled" }) {
  const { lang } = useTheme();
  const map = {
    active: { bn: "সক্রিয়", en: "Active", variant: "success" as const },
    expired: { bn: "মেয়াদোত্তীর্ণ", en: "Expired", variant: "muted" as const },
    exhausted: { bn: "শেষ", en: "Exhausted", variant: "warning" as const },
    inactive: { bn: "নিষ্ক্রিয়", en: "Inactive", variant: "danger" as const },
    scheduled: { bn: "সূচীভুক্ত", en: "Scheduled", variant: "info" as const },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{lang === "bn" ? m.bn : m.en}</Badge>;
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

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded px-3 py-1 text-xs font-medium bg-primary-700 text-white"
          : "rounded px-3 py-1 text-xs font-medium text-ink-700 dark:text-ink-900 hover:bg-ink-100 dark:hover:bg-ink-200"
      }
    >
      {children}
    </button>
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