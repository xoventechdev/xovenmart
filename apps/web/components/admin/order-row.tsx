"use client";

import Link from "next/link";
import { Phone, MapPin, ChevronRight } from "lucide-react";
import { OrderStatusBadge } from "./order-status-badge";
import { CopyButton } from "@/components/copy-button";
import { cn, formatBDT, relativeTime } from "@/lib/utils";

export interface AdminOrderRow {
  id: string;
  orderNo: string;
  status: string;
  grandTotal: number | string;
  placedAt: string | Date;
  paymentMethod?: string;
  paymentStatus?: string;
  /** Order channel: WEB (web storefront), POS (cashier/admin), ANDROID (customer app). */
  source?: string;
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
  items?: { name?: string; qty: number }[];
  delivery?: { rider?: { name?: string } | null } | null;
  address?: { area?: string; city?: string } | null;
}

export function OrderRow({
  o,
  lang,
  showStatus = true,
}: {
  o: AdminOrderRow;
  lang: "bn" | "en";
  showStatus?: boolean;
}) {
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const name = o.user?.name || o.guestName || t("গেস্ট", "Guest");
  const phone = o.user?.phone || o.guestPhone || "—";
  const itemCount = o.items?.length ?? 0;
  const itemTotalQty = o.items?.reduce((s, x) => s + (x.qty || 0), 0) ?? 0;

  return (
    <Link
      href={`/admin/orders/detail/${o.id}`}
      className="flex items-center justify-between gap-3 rounded-md border border-ink-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:hover:bg-primary-100"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-ink-900 dark:text-ink-900">
            #{o.orderNo}
          </span>
          <CopyButton value={o.orderNo} />
          {showStatus && <OrderStatusBadge status={o.status} lang={lang} />}
          {o.paymentMethod && (
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-700 dark:bg-ink-700 dark:text-ink-100">
              {o.paymentMethod}
            </span>
          )}
          {o.source && o.source !== "WEB" && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                o.source === "POS"
                  ? "bg-info-100 text-info-700"
                  : "bg-primary-100 text-primary-700"
              )}
            >
              {o.source}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
          <span className="font-semibold text-ink-700 dark:text-ink-900">{name}</span>
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {phone}
          </span>
          {o.delivery?.rider?.name && (
            <span className="text-info-700">
              {t("রাইডার:", "Rider:")} {o.delivery.rider.name}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
          <span>{itemTotalQty} {t("আইটেম", "items")}</span>
          <span>•</span>
          <span>{relativeTime(o.placedAt, lang)}</span>
          {o.address?.area && (
            <>
              <span>•</span>
              <span className="inline-flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3" />
                {o.address.area}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-right">
        <div>
          <div className="font-bold text-ink-900 dark:text-ink-900">
            {formatBDT(o.grandTotal)}
          </div>
          <div className="text-[10px] text-ink-500">{itemCount} SKU</div>
        </div>
        <ChevronRight className="h-4 w-4 text-ink-400" />
      </div>
    </Link>
  );
}
