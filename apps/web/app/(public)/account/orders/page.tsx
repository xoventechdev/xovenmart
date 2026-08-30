"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  Copy,
  Loader2,
  MapPin,
  Package,
  Phone,
  Receipt,
  ShoppingBag,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { CopyButton } from "@/components/copy-button";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

interface OrderItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderDelivery {
  riderName?: string;
  riderPhone?: string;
  assignedAt?: string;
  deliveredAt?: string;
  proofStatus?: string;
}

interface MyOrder {
  id: string;
  orderNo: string;
  status: string;
  statusBn?: string;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus?: string;
  address?: any;
  guestName?: string;
  guestPhone?: string;
  notes?: string;
  items: OrderItem[];
  delivery: OrderDelivery | null;
  placedAt: string;
  confirmedAt?: string;
}

const STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "danger" | "info" | "muted"
> = {
  PENDING: "warning",
  ACCEPTED: "info",
  PREPARING: "info",
  PREPARED: "info",
  OUT_FOR_DELIVERY: "default",
  DELIVERED: "success",
  CANCELLED: "danger",
  RETURNED: "muted",
  REFUNDED: "muted",
};

export default function AccountOrdersPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const auth = useAuth();

  const q = useQuery({
    queryKey: ["customers", "orders", "mine"],
    queryFn: () => api.get<MyOrder[]>("/orders/mine"),
    enabled: api.isAuthenticated(),
    staleTime: 30_000,
  });

  const [active, setActive] = useState<MyOrder | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("আমার অর্ডার", "My orders")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              "আপনার সকল অর্ডারের ইতিহাস — বিস্তারিত দেখতে যেকোনো অর্ডারে ক্লিক করুন",
              "Your full order history — click any order for details",
            )}
          </p>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
            </div>
          ) : !q.data?.length ? (
            <div className="rounded-lg border border-dashed border-ink-300 p-8 text-center dark:border-ink-300">
              <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-ink-400" />
              <p className="mb-3 text-sm text-ink-700 dark:text-ink-900">
                {t("এখনো কোনো অর্ডার নেই", "No orders yet")}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/">{t("কেনাকাটা শুরু করুন", "Start shopping")}</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-ink-200 dark:divide-ink-300">
              {q.data.map((o) => (
                <li
                  key={o.id}
                  className="flex cursor-pointer items-center gap-3 py-3 transition hover:bg-ink-100/50 dark:hover:bg-ink-50/50"
                  onClick={() => setActive(o)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-ink-900 dark:text-ink-900">
                        {o.orderNo}
                      </span>
                      <Badge variant={STATUS_VARIANT[o.status] ?? "muted"}>
                        {lang === "en" ? o.status : o.statusBn || o.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formatDate(o.placedAt, lang)} · {o.items.length}{" "}
                      {t("আইটেম", "items")}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-ink-900 dark:text-ink-900">
                      ৳{o.grandTotal.toFixed(0)}
                    </div>
                    <div className="text-[10px] uppercase text-ink-500">
                      {o.paymentMethod}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <OrderDetailModal
        order={active}
        onClose={() => setActive(null)}
        phone={auth.user?.phone}
        lang={lang}
      />
    </div>
  );
}

function formatDate(iso: string, lang: "bn" | "en"): string {
  const d = new Date(iso);
  if (lang === "bn") {
    const months = [
      "জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন",
      "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে",
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OrderDetailModal({
  order,
  onClose,
  phone,
  lang,
}: {
  order: MyOrder | null;
  onClose: () => void;
  phone?: string;
  lang: "bn" | "en";
}) {
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  if (!order) return null;

  const addr = order.address ?? {};
  const trackHref = phone
    ? `/track?orderNo=${encodeURIComponent(order.orderNo)}&phone=${encodeURIComponent(phone)}`
    : `/track?orderNo=${encodeURIComponent(order.orderNo)}`;

  return (
    <Modal open={!!order} onClose={onClose}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-bold text-ink-900 dark:text-ink-900">
            {order.orderNo}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[order.status] ?? "muted"}>
              {lang === "en" ? order.status : order.statusBn || order.status}
            </Badge>
            <span className="text-xs text-ink-500">
              {formatDate(order.placedAt, lang)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Items */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-900">
            <Package className="h-4 w-4" />
            {t("আইটেম", "Items")}
          </h3>
          <ul className="space-y-1 text-sm">
            {order.items.map((it, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-2 text-ink-700 dark:text-ink-900"
              >
                <span className="truncate">
                  {it.name}{" "}
                  <span className="text-ink-500">×{it.qty}</span>
                </span>
                <span className="font-mono">৳{it.lineTotal.toFixed(0)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Totals */}
        <div className="rounded-md bg-ink-100 p-3 text-sm dark:bg-ink-50">
          <div className="flex justify-between">
            <span className="text-ink-500">{t("সাবটোটাল", "Subtotal")}</span>
            <span>৳{order.subtotal.toFixed(2)}</span>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex justify-between text-success-700">
              <span>{t("ডিসকাউন্ট", "Discount")}</span>
              <span>-৳{order.discountTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-ink-500">{t("ডেলিভারি", "Delivery")}</span>
            <span>৳{order.deliveryFee.toFixed(2)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-ink-200 pt-1 font-semibold dark:border-ink-300">
            <span>{t("সর্বমোট", "Total")}</span>
            <span>৳{order.grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Address */}
        {addr.fullText && (
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-900">
              <MapPin className="h-4 w-4" />
              {t("ঠিকানা", "Address")}
            </h3>
            <p className="text-sm text-ink-700 dark:text-ink-900">
              {addr.fullText}
              {addr.landmark && (
                <span className="block text-xs text-ink-500">
                  ({addr.landmark})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Rider */}
        {order.delivery?.riderName && (
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-900">
              <Bike className="h-4 w-4" />
              {t("রাইডার", "Rider")}
            </h3>
            <p className="text-sm text-ink-700 dark:text-ink-900">
              {order.delivery.riderName}
              {order.delivery.riderPhone && (
                <a
                  href={`tel:${order.delivery.riderPhone}`}
                  className="ml-2 inline-flex items-center gap-1 text-primary-700 hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {order.delivery.riderPhone}
                </a>
              )}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-ink-200 pt-3 dark:border-ink-300">
          <CopyButton value={order.orderNo} />
          <Button asChild variant="outline" size="sm">
            <Link href={trackHref}>{t("অর্ডার ট্র্যাক", "Track order")}</Link>
          </Button>
        </div>
      </div>
    </Modal>
  );
}