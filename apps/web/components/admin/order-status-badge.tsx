"use client";

import { Badge } from "@/components/ui/badge";

export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PREPARING"
  | "PREPARED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED"
  | "REFUNDED";

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "PREPARED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "REFUNDED",
];

export const STATUS_MAP: Record<
  OrderStatus,
  { bn: string; en: string; variant: any; dotClass: string }
> = {
  PENDING: {
    bn: "অপেক্ষমান",
    en: "Pending",
    variant: "warning",
    dotClass: "bg-warning-500",
  },
  ACCEPTED: {
    bn: "গৃহীত",
    en: "Accepted",
    variant: "info",
    dotClass: "bg-info-500",
  },
  PREPARING: {
    bn: "প্রস্তুত হচ্ছে",
    en: "Preparing",
    variant: "info",
    dotClass: "bg-info-500",
  },
  PREPARED: {
    bn: "প্রস্তুত",
    en: "Ready",
    variant: "info",
    dotClass: "bg-info-700",
  },
  OUT_FOR_DELIVERY: {
    bn: "ডেলিভারিতে",
    en: "Dispatched",
    variant: "accent",
    dotClass: "bg-accent-500",
  },
  DELIVERED: {
    bn: "ডেলিভারি সম্পন্ন",
    en: "Delivered",
    variant: "success",
    dotClass: "bg-success-500",
  },
  CANCELLED: {
    bn: "বাতিল",
    en: "Cancelled",
    variant: "danger",
    dotClass: "bg-danger-500",
  },
  RETURNED: {
    bn: "ফেরত",
    en: "Returned",
    variant: "warning",
    dotClass: "bg-warning-700",
  },
  REFUNDED: {
    bn: "টাকা ফেরত",
    en: "Refunded",
    variant: "muted",
    dotClass: "bg-ink-500",
  },
};

export function OrderStatusBadge({
  status,
  lang,
}: {
  status: OrderStatus | string;
  lang: "bn" | "en";
}) {
  const s = STATUS_MAP[status as OrderStatus] ?? {
    bn: status,
    en: status,
    variant: "muted",
    dotClass: "bg-ink-400",
  };
  return (
    <Badge variant={s.variant} className="gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dotClass}`} />
      {lang === "bn" ? s.bn : s.en}
    </Badge>
  );
}

/**
 * Allowed status transitions (server-side enforced).
 * Mirrors the whitelist in OrdersService.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["PREPARED", "CANCELLED"],
  PREPARED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RETURNED", "CANCELLED"],
  DELIVERED: ["RETURNED"],
  RETURNED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};
