"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket,
  ArrowLeft,
  Filter,
  Receipt,
  TrendingUp,
  Hash,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface Redemption {
  couponId: string;
  couponCode: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  customerPhone: string | null;
  orderTotal: number;
  discountApplied: number;
  placedAt: string;
}

interface CouponLite {
  id: string;
  code: string;
}

export default function RedemptionsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [couponFilter, setCouponFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  // Fetch list of coupons for filter dropdown
  const { data: coupons } = useQuery({
    queryKey: ["admin", "coupons", "all"],
    queryFn: () => api.get("/admin/coupons/all"),
  });
  const couponList: CouponLite[] = (coupons ?? []) as any;

  // Fetch redemptions page-by-page.
  const { data: redemptionsRes, isLoading } = useQuery({
    queryKey: ["admin", "coupons", "redemptions", page, perPage],
    queryFn: async () => {
      const res = await api.get<{ items: any[]; total: number; page: number; perPage: number }>(
        `/admin/coupons/redemptions/aggregated?page=${page}&perPage=${perPage}`,
      );
      return {
        items: res.items.map((o: any): Redemption => ({
          couponId: o.coupon?.id ?? "",
          couponCode: o.coupon?.code ?? "(unknown)",
          orderId: o.id,
          orderNo: o.orderNo,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          orderTotal: Number(o.orderTotal),
          discountApplied: Number(o.discountApplied),
          placedAt: o.placedAt,
        })),
        total: res.total ?? 0,
      };
    },
  });

  const list: Redemption[] = (redemptionsRes?.items ?? []) as any;
  const total: number = redemptionsRes?.total ?? 0;

  const filtered = list.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesCoupon = !couponFilter || r.couponId === couponFilter;
    const matchesQ =
      !q ||
      r.orderNo.toLowerCase().includes(q) ||
      r.couponCode.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      (r.customerPhone ?? "").includes(q);
    return matchesCoupon && matchesQ;
  });

  // Stats
  const totalCount = filtered.length;
  const totalDiscount = filtered.reduce((s, r) => s + r.discountApplied, 0);
  const totalOrderValue = filtered.reduce((s, r) => s + r.orderTotal, 0);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/coupons"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("কুপন তালিকায়", "Back to coupons")}
        </Link>
        <div className="mt-1">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("কুপন ব্যবহার", "Coupon Redemptions")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "কোন কুপন কোন অর্ডারে কতটি ছাড় দিয়েছে",
              "Per-order breakdown of which coupon gave which discount",
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={<Receipt className="h-5 w-5" />} tone="primary" label={t("মোট ব্যবহার", "Total Redemptions")} value={totalCount} />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          tone="warning"
          label={t("মোট ছাড়", "Total Discount Given")}
          value={`৳${totalDiscount.toLocaleString()}`}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />}
          tone="success"
          label={t("মোট অর্ডার মূল্য", "Filtered Order Value")}
          value={`৳${totalOrderValue.toLocaleString()}`}
        />
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Filter className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("অর্ডার #, কোড, গ্রাহক বা ফোন", "Order #, code, customer, phone")}
                className="pl-8"
              />
            </div>
            <select
              value={couponFilter}
              onChange={(e) => setCouponFilter(e.target.value)}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="">{t("সব কুপন", "All coupons")}</option>
              {couponList.map((c) => (
                <option key={c.id} value={c.id}>{c.code}</option>
              ))}
            </select>
            <span className="ml-auto text-sm text-ink-500">
              {filtered.length} {t("টি", "items")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> {t("ব্যবহারের ইতিহাস", "Redemption History")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {t("কোন ব্যবহার পাওয়া যায়নি", "No redemptions found")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-700 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("অর্ডার #", "Order #")}</th>
                    <th className="px-3 py-2 text-left">{t("কুপন কোড", "Coupon")}</th>
                    <th className="px-3 py-2 text-left">{t("গ্রাহক", "Customer")}</th>
                    <th className="px-3 py-2 text-right">{t("অর্ডার মূল্য", "Order Total")}</th>
                    <th className="px-3 py-2 text-right">{t("ছাড়", "Discount")}</th>
                    <th className="px-3 py-2 text-left">{t("তারিখ", "Date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={`${r.couponId}-${r.orderId}`}
                      className="border-t border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/admin/orders/detail/${r.orderId}`}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary-700 hover:underline"
                          >
                            <Hash className="h-3 w-3" /> {r.orderNo}
                          </Link>
                          {r.orderNo && <CopyButton value={r.orderNo} />}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="default" className="font-mono">{r.couponCode}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.customerName}</div>
                        {r.customerPhone && (
                          <div className="flex items-center gap-1 text-xs text-ink-500">
                            <Phone className="h-3 w-3" /> {r.customerPhone}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        ৳{r.orderTotal.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-success-700">
                        −৳{r.discountApplied.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-500">
                        {formatDateTime(r.placedAt, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DataTablePagination
            page={page}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            showRange
          />
        </CardContent>
      </Card>
    </div>
  );
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

function formatDateTime(s: string, lang: "bn" | "en") {
  try {
    const d = new Date(s);
    return d.toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
}