"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { OrderRow, type AdminOrderRow } from "@/components/admin/order-row";
import { OrderFilterBar } from "@/components/admin/order-filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  STATUS_MAP,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/components/admin/order-status-badge";

interface OrdersListProps {
  /** Filter to one or more statuses */
  statuses?: OrderStatus[];
  /** Title (BN/EN) */
  titleBn: string;
  titleEn: string;
  /** Description (BN/EN) */
  descBn?: string;
  descEn?: string;
  /** Optional link to view all */
  viewAllHref?: string;
  viewAllBn?: string;
  viewAllEn?: string;
  /** Show status column toggle / kanban view */
  showViewToggle?: boolean;
  /** Default view */
  defaultView?: "list" | "kanban";
  /**
   * When the page covers multiple statuses (e.g. processing = ACCEPTED +
   * PREPARING + PREPARED), show the per-status count chips. Off by
   * default — most pages filter to a single status and the chips just
   * clutter the toolbar.
   */
  showStatusCounts?: boolean;
}

export function OrdersList({
  statuses,
  titleBn,
  titleEn,
  descBn,
  descEn,
  viewAllHref,
  viewAllBn,
  viewAllEn,
  showViewToggle = true,
  defaultView = "list",
  showStatusCounts = false,
}: OrdersListProps) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "kanban">(defaultView);
  // Source filter — "" = all, "WEB" / "POS" / "ANDROID" = filter to that channel.
  const [source, setSource] = useState<string>("");

  const params = new URLSearchParams();
  if (statuses && statuses.length > 0) {
    params.set("statuses", statuses.join(","));
  }
  if (source) {
    params.set("source", source);
  }
  params.set("perPage", "100");

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin", "orders", statuses?.join(","), q, source],
    queryFn: () => api.get(`/admin/orders?${params.toString()}`),
  });

  const items: AdminOrderRow[] = (data?.items ?? []) as any;

  // Client-side filter
  const filtered = q.trim()
    ? items.filter((o) => {
        const s = q.toLowerCase();
        return (
          o.orderNo?.toLowerCase().includes(s) ||
          (o.guestName || "").toLowerCase().includes(s) ||
          (o.user?.name || "").toLowerCase().includes(s) ||
          (o.guestPhone || "").includes(s) ||
          (o.user?.phone || "").includes(s)
        );
      })
    : items;

  const exportCsv = () => {
    const headers = ["Order No", "Customer", "Phone", "Status", "Source", "Payment", "Total", "Placed At"];
    const rows = filtered.map((o) => [
      o.orderNo,
      o.guestName || o.user?.name || "Guest",
      o.guestPhone || o.user?.phone || "",
      o.status,
      o.source ?? "WEB",
      o.paymentMethod ?? "",
      String(o.grandTotal),
      new Date(o.placedAt).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Kanban: group by status
  const grouped: Record<string, AdminOrderRow[]> = {};
  if (view === "kanban") {
    const columns = statuses && statuses.length > 0 ? statuses : ORDER_STATUSES;
    for (const s of columns) grouped[s] = [];
    for (const o of filtered) {
      if (grouped[o.status]) grouped[o.status].push(o);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t(titleBn, titleEn)}
          </h1>
          {(descBn || descEn) && (
            <p className="mt-1 text-sm text-ink-500">{t(descBn ?? "", descEn ?? "")}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showViewToggle && (
            <div className="inline-flex rounded-md border border-ink-200 p-0.5 dark:border-ink-300">
              <button
                onClick={() => setView("list")}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                  view === "list" ? "bg-primary-700 text-white" : "text-ink-700 dark:text-ink-900"
                )}
              >
                <List className="h-3.5 w-3.5" /> {t("তালিকা", "List")}
              </button>
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                  view === "kanban" ? "bg-primary-700 text-white" : "text-ink-700 dark:text-ink-900"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> {t("কানবান", "Kanban")}
              </button>
            </div>
          )}
          {viewAllHref && (
            <Link href={viewAllHref}>
              <Button variant="outline" size="sm">
                {t(viewAllBn ?? "সব দেখুন", viewAllEn ?? "View all")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <OrderFilterBar q={q} onQChange={setQ} onRefresh={() => refetch()} onExport={exportCsv} />

      {/* Source filter chips — All / Web / POS / Android */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-500">{t("চ্যানেল:", "Channel:")}</span>
        {[
          { value: "", bn: "সব", en: "All" },
          { value: "WEB", bn: "ওয়েব", en: "Web" },
          { value: "POS", bn: "POS", en: "POS" },
          { value: "ANDROID", bn: "অ্যান্ড্রয়েড", en: "Android" },
        ].map((opt) => (
          <button
            key={opt.value || "all"}
            onClick={() => setSource(opt.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              source === opt.value
                ? "border-primary-700 bg-primary-700 text-white"
                : "border-ink-200 bg-white text-ink-700 hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900"
            )}
          >
            {t(opt.bn, opt.en)}
          </button>
        ))}
      </div>

      {/* Counts strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span>
          {t("মোট:", "Total:")}{" "}
          <span className="font-semibold text-ink-900 dark:text-ink-900">{filtered.length}</span>
        </span>
        {showStatusCounts && statuses && statuses.length > 1 && (
          <span className="ml-2 inline-flex flex-wrap gap-2">
            {statuses.map((s) => (
              <span
                key={s}
                className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700 dark:bg-ink-700 dark:text-ink-100"
              >
                {STATUS_MAP[s].bn}: <b>{items.filter((o) => o.status === s).length}</b>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <Card>
          <CardContent className="p-2 sm:p-3">
            {isLoading ? (
              <Skeleton />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={t("কোন অর্ডার নেই", "No orders found")}
                sub={t("ফিল্টার পরিবর্তন করে দেখুন", "Try changing filters")}
              />
            ) : (
              <div className="space-y-2">
                {filtered.map((o) => (
                  <OrderRow key={o.id} o={o} lang={lang} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KANBAN VIEW */}
      {view === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {(statuses && statuses.length > 0 ? statuses : ORDER_STATUSES).map((s) => (
            <div
              key={s}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-ink-200 bg-ink-50 dark:border-ink-300 dark:bg-ink-100"
            >
              <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2 dark:border-ink-300">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STATUS_MAP[s].dotClass}`} />
                  <span className="text-sm font-semibold text-ink-900 dark:text-ink-900">
                    {t(STATUS_MAP[s].bn, STATUS_MAP[s].en)}
                  </span>
                </div>
                <span className="rounded-full bg-ink-200 px-2 py-0.5 text-xs font-bold text-ink-700 dark:bg-ink-700 dark:text-ink-100">
                  {grouped[s]?.length ?? 0}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {(grouped[s] ?? []).map((o) => (
                  <OrderRow key={o.id} o={o} lang={lang} />
                ))}
                {(!grouped[s] || grouped[s].length === 0) && (
                  <div className="rounded border-2 border-dashed border-ink-200 p-4 text-center text-xs text-ink-400 dark:border-ink-300">
                    {t("খালি", "Empty")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-ink-100 dark:bg-ink-200" />
      ))}
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-3xl">📦</div>
      <div className="mt-2 font-semibold text-ink-900 dark:text-ink-900">{title}</div>
      {sub && <div className="text-sm text-ink-500">{sub}</div>}
    </div>
  );
}
