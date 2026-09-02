"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Wallet,
  Users,
  Boxes,
  TrendingUp,
  Clock,
  CheckCircle2,
  Package,
  ArrowUpRight,
  Ticket,
  Calculator,
  AlertTriangle,
  Truck,
  XCircle,
  Banknote,
  Globe,
  ChevronRight,
  Package2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { DeltaChip } from "@/components/admin/delta-chip";
import {
  CategorySplitChart,
  PaymentSplitDonut,
  RevenueTrendChart,
  SourceSplitDonut,
  StatusFunnel,
  TopProductsChart,
} from "@/components/admin/dashboard-charts";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { formatBDT, relativeTime } from "@/lib/utils";
import Link from "next/link";

/**
 * Admin Dashboard — single-screen overview.
 *
 * Layout (top → bottom):
 *  1. Greeting + period strip (today / week / month) with delta chips
 *  2. 4 KPI tiles (orders today, revenue today, pending, low stock)
 *  3. Two side-by-side: 14-day revenue + orders trend chart + orders-by-source donut
 *  4. Status funnel + payment-method donut
 *  5. Top products (this week) + category revenue split
 *  6. Low-stock alert list
 *  7. Recent orders (last 8) + quick actions sidebar
 *
 * Data sources:
 *   GET /admin/stats       → tiles, funnel, source split, lowStock, deltas
 *   GET /admin/dashboard   → daily series, top products, payment split, category split
 *   GET /admin/orders      → recent orders
 *
 * Refresh strategy: react-query with 60s stale time — the admin sees their
 * own activity so 1-minute freshness is enough.
 */

export default function DashboardPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/admin/stats"),
    refetchInterval: 60_000,
  });

  const { data: dash } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => api.get("/admin/dashboard"),
    refetchInterval: 60_000,
  });

  const { data: ordersData } = useQuery({
    queryKey: ["admin", "orders", "recent"],
    queryFn: () => api.get("/admin/orders?perPage=8"),
  });

  // ─── Primary KPI tiles (today) ──────────────────────────────
  const primaryTiles = [
    {
      key: "ordersToday",
      label: t("আজকের অর্ডার", "Orders Today"),
      icon: ShoppingCart,
      color: "bg-primary-100 text-primary-700",
      value: stats?.ordersToday ?? 0,
    },
    {
      key: "revenueToday",
      label: t("আজকের আয়", "Revenue Today"),
      icon: Wallet,
      color: "bg-success-100 text-success-700",
      value: stats ? formatBDT(stats.revenueToday) : "৳0",
    },
    {
      key: "pending",
      label: t("অপেক্ষমান", "Awaiting Action"),
      icon: Clock,
      color: "bg-warning-100 text-warning-700",
      value: stats?.pending ?? 0,
    },
    {
      key: "lowStock",
      label: t("কম স্টক", "Low Stock"),
      icon: Boxes,
      color: "bg-danger-100 text-danger-700",
      value: stats?.lowStockCount ?? 0,
      // Show how many of the low-stock items are *completely* empty
      // (stockQty <= 0). Different urgency — those can no longer be sold.
      subValue:
        stats && stats.outOfStockCount != null
          ? t(
              `${stats.outOfStockCount} টি স্টক শেষ`,
              `${stats.outOfStockCount} out of stock`,
            )
          : undefined,
    },
  ];

  // ─── Period summary strip (week + month + their deltas) ──────
  const periodStrip = [
    {
      key: "week-orders",
      label: t("সপ্তাহের অর্ডার", "This Week Orders"),
      value: stats?.ordersWeek ?? 0,
      delta: stats?.ordersWeekDelta ?? 0,
      icon: ShoppingCart,
    },
    {
      key: "week-revenue",
      label: t("সপ্তাহের আয়", "This Week Revenue"),
      value: formatBDT(stats?.revenueWeek ?? 0),
      delta: stats?.revenueWeekDelta ?? 0,
      icon: Wallet,
    },
    {
      key: "month-orders",
      label: t("মাসের অর্ডার", "This Month Orders"),
      value: stats?.ordersMonth ?? 0,
      delta: stats?.ordersMonthDelta ?? 0,
      icon: TrendingUp,
    },
    {
      key: "month-revenue",
      label: t("মাসের আয়", "This Month Revenue"),
      value: formatBDT(stats?.revenueMonth ?? 0),
      delta: stats?.revenueMonthDelta ?? 0,
      icon: Banknote,
    },
  ];

  const todayCounters = [
    { key: "inProgress",  label: t("প্রস্তুত হচ্ছে", "In Progress"),  value: stats?.inProgress ?? 0,  icon: Package2,  color: "text-warning-700" },
    { key: "deliveredToday", label: t("আজ ডেলিভার্ড", "Delivered Today"), value: stats?.deliveredToday ?? 0, icon: CheckCircle2, color: "text-success-700" },
    { key: "cancelledToday", label: t("আজ বাতিল", "Cancelled Today"), value: stats?.cancelledToday ?? 0, icon: XCircle, color: "text-danger-700" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("স্বাগতম! 👋", "Welcome back! 👋")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("আজকের সারসংক্ষেপ এবং আপনার ব্যবসার সর্বশেষ অবস্থা", "Today's snapshot and the latest from your store")}
        </p>
      </div>

      {/* Period strip — week + month with deltas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {periodStrip.map((p) => (
          <Card key={p.key}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs text-ink-500">{p.label}</div>
                  <div className="mt-0.5 truncate text-base font-bold text-ink-900 dark:text-ink-900 md:text-lg">
                    {p.value}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p.icon className="h-4 w-4 text-ink-400" />
                  <DeltaChip value={p.delta} lang={lang} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPI tiles — today */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {primaryTiles.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-start justify-between">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-ink-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-ink-900 dark:text-ink-900">{s.value}</div>
                <div className="text-xs text-ink-500 md:text-sm">{s.label}</div>
                {(s as any).subValue && (
                  <div className="mt-1 text-[10px] font-medium text-danger-600">
                    {(s as any).subValue}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick today counters */}
      <div className="grid grid-cols-3 gap-3">
        {todayCounters.map((c) => (
          <div key={c.key} className="flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2 dark:border-ink-300 dark:bg-ink-50">
            <c.icon className={`h-4 w-4 ${c.color}`} />
            <div className="flex-1">
              <div className="text-xs text-ink-500">{c.label}</div>
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-900">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Trend chart + source split */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("গত ১৪ দিনের প্রবণতা", "14-Day Trend")}</CardTitle>
            <span className="text-xs text-ink-500">{t("আয় ও অর্ডার", "Revenue & Orders")}</span>
          </CardHeader>
          <CardContent>
            {dash?.daily?.length ? (
              <RevenueTrendChart data={dash.daily} lang={lang} />
            ) : (
              <ChartSkeleton />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("চ্যানেল ভাগ", "Channel Split")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.sourceSplit ? (
              <SourceSplitDonut split={stats.sourceSplit} lang={lang} />
            ) : (
              <ChartSkeleton />
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {(["WEB", "POS", "ANDROID"] as const).map((k) => (
                <div key={k}>
                  <div className="text-[10px] uppercase text-ink-500">{k}</div>
                  <div className="text-sm font-semibold text-ink-900 dark:text-ink-900">
                    {stats?.sourceSplit?.[k] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status funnel + payment split */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("অর্ডার লাইফসাইকেল", "Order Lifecycle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.funnel ? <StatusFunnel counts={stats.funnel} lang={lang} /> : <ChartSkeleton />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("পেমেন্ট পদ্ধতি", "Payment Methods")}</CardTitle>
          </CardHeader>
          <CardContent>
            {dash?.paymentSplit ? <PaymentSplitDonut items={dash.paymentSplit} lang={lang} /> : <ChartSkeleton />}
          </CardContent>
        </Card>
      </div>

      {/* Top products + category split */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("শীর্ষ পণ্য (৭ দিন)", "Top Products (7 days)")}</CardTitle>
            <Link href="/admin/products" className="text-xs font-semibold text-primary-700 hover:underline">
              {t("সব দেখুন →", "View all →")}
            </Link>
          </CardHeader>
          <CardContent>
            {dash?.topProducts?.length ? <TopProductsChart items={dash.topProducts} lang={lang} /> : <ChartSkeleton />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("ক্যাটাগরি আয়", "Category Revenue")}</CardTitle>
            <span className="text-xs text-ink-500">{t("গত ৩০ দিন", "Last 30 days")}</span>
          </CardHeader>
          <CardContent>
            {dash?.categorySplit?.length ? <CategorySplitChart items={dash.categorySplit} lang={lang} /> : <ChartSkeleton />}
          </CardContent>
        </Card>
      </div>

      {/* Low-stock + Recent orders + Quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Low-stock alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-danger-500" />
              {t("কম স্টক সতর্কতা", "Low Stock Alerts")}
            </CardTitle>
            <Link href="/admin/inventory" className="text-xs font-semibold text-primary-700 hover:underline">
              {t("সব দেখুন →", "View all →")}
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats?.lowStock?.slice(0, 5).map((p: any) => (
                <Link
                  key={p.productId}
                  href={`/admin/products/${p.productId}/edit`}
                  className="flex items-center gap-3 rounded-md border border-ink-200 p-2 transition-colors hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-200"
                >
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-ink-100">
                    {p.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-4 w-4 text-ink-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-ink-900 dark:text-ink-900">
                      {lang === "bn" ? p.nameBn : p.nameEn}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-500">
                      <span>{t("বর্তমান:", "Stock:")} <strong className="text-danger-700">{p.stockQty}</strong></span>
                      <span>·</span>
                      <span>{t("সীমা:", "Threshold:")} {p.lowStockThreshold}</span>
                    </div>
                  </div>
                  <Badge variant="danger">{t("কম", "Low")}</Badge>
                </Link>
              )) ?? <Empty msg={t("সব পণ্য স্টকে আছে", "All products are well stocked")} />}
            </div>
          </CardContent>
        </Card>

        {/* Recent orders */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("সাম্প্রতিক অর্ডার", "Recent Orders")}</CardTitle>
            <Link href="/admin/orders/all" className="text-xs font-semibold text-primary-700 hover:underline">
              {t("সব দেখুন →", "View all →")}
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ordersData?.items?.slice(0, 8).map((o: any) => (
                <Link
                  key={o.id}
                  href={`/admin/orders/detail/${o.id}`}
                  className="flex items-center justify-between rounded-md border border-ink-200 p-3 transition-colors hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-200"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{o.orderNo}</span>
                      <CopyButton value={o.orderNo} />
                      <StatusBadge status={o.status} lang={lang} />
                      <SourceBadge source={o.source} lang={lang} />
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-500">
                      {o.user?.name || o.guestName || t("গেস্ট", "Guest")} · {relativeTime(o.placedAt, lang)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-ink-900 dark:text-ink-900">{formatBDT(o.grandTotal)}</div>
                    <div className="text-xs text-ink-500">{o.items?.length || 0} {t("আইটেম", "items")}</div>
                  </div>
                </Link>
              )) ?? <Empty msg={t("কোন অর্ডার নেই", "No orders yet")} />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions row */}
      <Card>
        <CardHeader>
          <CardTitle>{t("দ্রুত অ্যাকশন", "Quick Actions")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          <QuickLink href="/admin/orders/pending" labelBn="নতুন অর্ডার দেখুন" labelEn="View new orders" icon={Clock} />
          <QuickLink href="/admin/pos" labelBn="দ্রুত অর্ডার (POS)" labelEn="Quick Order (POS)" icon={Calculator} />
          <QuickLink href="/admin/products/new" labelBn="পণ্য যোগ করুন" labelEn="Add new product" icon={Package} />
          <QuickLink href="/admin/coupons/new" labelBn="কুপন তৈরি" labelEn="Create coupon" icon={Ticket} />
          <QuickLink href="/admin/system/feature-toggles" labelBn="ফিচার টগল" labelEn="Feature toggles" icon={Truck} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function ChartSkeleton() {
  return <div className="h-[240px] animate-pulse rounded bg-ink-100 dark:bg-ink-200" />;
}

function Empty({ msg }: { msg: string }) {
  return <div className="py-8 text-center text-sm text-ink-500">{msg}</div>;
}

function QuickLink({ href, labelBn, labelEn, icon: Icon }: { href: string; labelBn: string; labelEn: string; icon: any }) {
  const { lang } = useTheme();
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-md border border-ink-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:hover:bg-primary-100"
    >
      <span className="text-sm font-medium">{lang === "bn" ? labelBn : labelEn}</span>
      <ChevronRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

const STATUS_MAP: Record<string, { bn: string; en: string; variant: any }> = {
  PENDING: { bn: "অপেক্ষমান", en: "Pending", variant: "warning" },
  ACCEPTED: { bn: "গৃহীত", en: "Accepted", variant: "info" },
  PREPARING: { bn: "প্রস্তুত হচ্ছে", en: "Preparing", variant: "info" },
  PREPARED: { bn: "প্রস্তুত", en: "Ready", variant: "info" },
  OUT_FOR_DELIVERY: { bn: "ডেলিভারিতে", en: "Dispatched", variant: "accent" },
  DELIVERED: { bn: "ডেলিভারি সম্পন্ন", en: "Delivered", variant: "success" },
  CANCELLED: { bn: "বাতিল", en: "Cancelled", variant: "danger" },
  RETURNED: { bn: "ফেরত", en: "Returned", variant: "warning" },
  REFUNDED: { bn: "টাকা ফেরত", en: "Refunded", variant: "muted" },
};

function StatusBadge({ status, lang }: { status: string; lang: "bn" | "en" }) {
  const s = STATUS_MAP[status] ?? { bn: status, en: status, variant: "muted" };
  return <Badge variant={s.variant}>{lang === "bn" ? s.bn : s.en}</Badge>;
}

const SOURCE_MAP: Record<string, { bn: string; en: string }> = {
  WEB: { bn: "ওয়েব", en: "Web" },
  POS: { bn: "POS", en: "POS" },
  ANDROID: { bn: "অ্যান্ড্রয়েড", en: "Android" },
};

function SourceBadge({ source, lang }: { source?: string; lang: "bn" | "en" }) {
  if (!source || source === "WEB") return null;
  const s = SOURCE_MAP[source];
  if (!s) return null;
  return (
    <Badge variant="outline" className="gap-1">
      <Globe className="h-3 w-3" />
      {lang === "bn" ? s.bn : s.en}
    </Badge>
  );
}
