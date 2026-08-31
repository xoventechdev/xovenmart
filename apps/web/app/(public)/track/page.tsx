"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Package, MapPin, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";

/**
 * Public order tracking page.
 *
 * Timeline rules:
 *   - Happy path: PENDING → ACCEPTED → PREPARING → PREPARED → OUT_FOR_DELIVERY → DELIVERED
 *   - Terminal-bad branches: CANCELLED, RETURNED, REFUNDED
 *
 * Backend `GET /api/v1/orders/track/{orderNo}` returns `statusEvents` shaped as
 *   { from: OrderStatus|null, to: OrderStatus, note: string|null, at: ISO-date }
 * so the timeline below reads exactly those keys.
 */
type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PREPARING"
  | "PREPARED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED"
  | "REFUNDED";

const STATUS_META: Record<
  OrderStatus,
  { bn: string; en: string; dotClass: string; badgeClass: string }
> = {
  PENDING: {
    bn: "অপেক্ষমান",
    en: "Pending",
    dotClass: "bg-warning-500",
    badgeClass: "bg-warning-100 text-warning-700",
  },
  ACCEPTED: {
    bn: "গৃহীত",
    en: "Accepted",
    dotClass: "bg-info-500",
    badgeClass: "bg-info-100 text-info-700",
  },
  PREPARING: {
    bn: "প্রস্তুত হচ্ছে",
    en: "Preparing",
    dotClass: "bg-info-500",
    badgeClass: "bg-info-100 text-info-700",
  },
  PREPARED: {
    bn: "প্রস্তুত",
    en: "Prepared",
    dotClass: "bg-info-700",
    badgeClass: "bg-info-100 text-info-700",
  },
  OUT_FOR_DELIVERY: {
    bn: "ডেলিভারিতে",
    en: "Out for delivery",
    dotClass: "bg-accent-500",
    badgeClass: "bg-accent-100 text-accent-700",
  },
  DELIVERED: {
    bn: "ডেলিভারি সম্পন্ন",
    en: "Delivered",
    dotClass: "bg-success-500",
    badgeClass: "bg-success-100 text-success-700",
  },
  CANCELLED: {
    bn: "বাতিল",
    en: "Cancelled",
    dotClass: "bg-danger-500",
    badgeClass: "bg-danger-100 text-danger-700",
  },
  RETURNED: {
    bn: "ফেরত",
    en: "Returned",
    dotClass: "bg-warning-700",
    badgeClass: "bg-warning-100 text-warning-700",
  },
  REFUNDED: {
    bn: "টাকা ফেরত",
    en: "Refunded",
    dotClass: "bg-ink-500",
    badgeClass: "bg-ink-100 text-ink-700",
  },
};

const HAPPY_STEPS: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "PREPARED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
const TERMINAL_BAD: OrderStatus[] = ["CANCELLED", "RETURNED", "REFUNDED"];

function statusLabel(s: OrderStatus | string, lang: "bn" | "en"): string {
  const meta = STATUS_META[s as OrderStatus];
  if (meta) return lang === "en" ? meta.en : meta.bn;
  return String(s);
}

// Route Segment Config — see apps/web/app/(public)/cart/page.tsx for rationale.
export const dynamic = "force-dynamic";

export default function TrackPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TrackPage />
    </Suspense>
  );
}

function TrackPage() {
  const sp = useSearchParams();
  const { lang } = useTheme();
  const tw = useTwin();
  const [orderNo, setOrderNo] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill from ?orderNo=...&phone=... on first load
  useEffect(() => {
    const qOrderNo = sp.get("orderNo");
    const qPhone = sp.get("phone");
    if (qOrderNo) setOrderNo(qOrderNo.toUpperCase());
    if (qPhone) setPhone(qPhone);
    if (qOrderNo) {
      setTimeout(() => doTrack(qOrderNo.toUpperCase(), qPhone ?? ""), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doTrack = async (orderNoArg: string, phoneArg: string) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const params = new URLSearchParams();
      if (phoneArg.trim()) params.set("phone", phoneArg.trim());
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(
        `${apiUrl}/api/v1/orders/track/${encodeURIComponent(orderNoArg.trim())}${qs}`
      );
      if (!res.ok) {
        if (res.status === 404 || res.status === 401) {
          throw new Error(tw("অর্ডার পাওয়া যায়নি", "Order not found"));
        }
        throw new Error(tw(
          "ট্র্যাক করতে সমস্যা হয়েছে",
          "Could not track order",
        ));
      }
      const data = await res.json();
      setOrder(data);
    } catch (e: any) {
      setError(e.message);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const track = () => {
    if (!orderNo.trim()) return;
    doTrack(orderNo, phone);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="text-center mb-8">
        <Package className="h-12 w-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-bold mb-2">
          {tw("অর্ডার ট্র্যাক করুন", "Track your order")}
        </h1>
        <p className="text-muted-foreground">
          {tw(
            "আপনার অর্ডার নম্বর দিয়ে ডেলিভারি স্ট্যাটাস দেখুন",
            "Check delivery status with your order number",
          )}
        </p>
      </div>

      <div className="bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-800 p-6">
        <div className="flex flex-col gap-2">
          <Input
            placeholder={tw("যেমন: XVM-260829-001", "e.g. XVM-260829-001")}
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && track()}
          />
          <Input
            type="tel"
            placeholder={tw(
              "ফোন নম্বর (ঐচ্ছিক — লিখলে বিস্তারিত দেখাবে)",
              "Phone (optional — gives more details)",
            )}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && track()}
          />
          <Button onClick={track} disabled={loading}>
            {loading ? "..." : tw("ট্র্যাক করুন", "Track")}
          </Button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        {order && (
          <div className="mt-6 space-y-5">
            {/* Order header */}
            <div className="flex items-center justify-between pb-4 border-b border-ink-200 dark:border-ink-800">
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {tw("অর্ডার নম্বর", "Order number")}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono">{order.orderNo}</span>
                    <CopyButton value={order.orderNo} />
                  </div>
                </div>
              </div>
              <StatusPill status={order.status} lang={lang} />
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">{tw("মোট", "Total")}</div>
                <div className="font-semibold">
                  ৳{Number(order.grandTotal || order.total || 0).toLocaleString("en-IN")}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{tw("পেমেন্ট", "Payment")}</div>
                <div className="font-semibold">{order.paymentMethod || "COD"}</div>
              </div>
            </div>

            {order.addressSnapshot && (
              <div className="p-3 bg-ink-50 dark:bg-ink-800 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {tw("ডেলিভারি ঠিকানা", "Delivery address")}
                </div>
                <div className="text-sm">
                  {order.addressSnapshot.fullText || order.addressSnapshot.label}
                </div>
              </div>
            )}

            {/* Timeline stepper */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {tw("স্ট্যাটাস টাইমলাইন", "Status timeline")}
              </h3>
              <TimelineStepper current={order.status as OrderStatus} lang={lang} />
            </div>

            {/* Event history (real events from server) */}
            {order.statusEvents && order.statusEvents.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-ink-700 dark:text-ink-300">
                  {tw("ইতিহাস", "History")}
                </h4>
                <ol className="space-y-3 border-t border-ink-200 dark:border-ink-300 pt-3">
                  {[...order.statusEvents]
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.at).getTime() - new Date(a.at).getTime(),
                    )
                    .map((ev: any, idx: number) => {
                      const toMeta = STATUS_META[ev.to as OrderStatus];
                      const fromMeta = ev.from
                        ? STATUS_META[ev.from as OrderStatus]
                        : null;
                      return (
                        <li key={idx} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                toMeta?.dotClass ?? "bg-ink-400"
                              }`}
                            />
                            {idx < order.statusEvents.length - 1 && (
                              <span className="my-1 h-6 w-px bg-ink-200 dark:bg-ink-300" />
                            )}
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                  toMeta?.badgeClass ?? "bg-ink-100 text-ink-700"
                                }`}
                              >
                                {statusLabel(ev.to as OrderStatus, lang)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(ev.at).toLocaleString(
                                  lang === "en" ? "en-GB" : "bn-BD",
                                  { dateStyle: "medium", timeStyle: "short" }
                                )}
                              </span>
                            </div>
                            {fromMeta && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {statusLabel(ev.from as OrderStatus, lang)} → {statusLabel(ev.to as OrderStatus, lang)}
                              </div>
                            )}
                            {ev.note && (
                              <div className="mt-0.5 text-[11px] italic text-ink-500">
                                &ldquo;{ev.note}&rdquo;
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, lang }: { status: OrderStatus | string; lang: "bn" | "en" }) {
  const meta = STATUS_META[status as OrderStatus] ?? {
    bn: status,
    en: String(status),
    dotClass: "bg-ink-400",
    badgeClass: "bg-ink-100 text-ink-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {lang === "en" ? meta.en : meta.bn}
    </span>
  );
}

/**
 * Horizontal stepper showing all known order statuses.
 * - Current: filled with status color, white "N"
 * - Past: same color, 80% opacity
 * - Future: muted gray
 * - Terminal-bad (CANCELLED / RETURNED / REFUNDED): renders as a side-state badge
 */
function TimelineStepper({ current, lang }: { current: OrderStatus; lang: "bn" | "en" }) {
  const tw = useTwin();
  const isTerminalBad = TERMINAL_BAD.includes(current);
  const currentIdx = HAPPY_STEPS.indexOf(current);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {HAPPY_STEPS.map((s, i) => {
          const isCurrent = s === current;
          const isPast = !isTerminalBad && currentIdx >= 0 && i < currentIdx;
          const isFuture = !isTerminalBad && (currentIdx < 0 || i > currentIdx);
          const meta = STATUS_META[s];
          return (
            <div key={s} className="flex items-center gap-1.5">
              <div
                className={[
                  "flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-2 text-[10px] font-bold",
                  isCurrent
                    ? `${meta.dotClass} text-white`
                    : isPast
                      ? `${meta.dotClass} text-white opacity-80`
                      : "bg-ink-100 text-ink-500 dark:bg-ink-200 dark:text-ink-700",
                ].join(" ")}
                title={lang === "en" ? meta.en : meta.bn}
              >
                {isCurrent && !isFuture ? (i + 1) : isPast ? <CheckCircle2 className="h-3 w-3" /> : (i + 1)}
              </div>
              <span
                className={`text-[11px] ${
                  isCurrent
                    ? "font-bold text-ink-900 dark:text-ink-100"
                    : isPast
                      ? "text-ink-700 dark:text-ink-300"
                      : "text-ink-500"
                }`}
              >
                {lang === "en" ? meta.en : meta.bn}
              </span>
              {i < HAPPY_STEPS.length - 1 && (
                <span
                  className={`mx-1 h-px w-4 ${
                    isPast ? "bg-primary-500" : "bg-ink-200 dark:bg-ink-300"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {isTerminalBad && (
        <div className="inline-flex items-center gap-2 rounded-md border border-danger-200 bg-danger-100 px-2 py-1 text-xs text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/20">
          <AlertCircle className="h-3 w-3" />
          <span className="font-semibold">{statusLabel(current, lang)}</span>
          <span className="text-danger-700/80">· {tw("চূড়ান্ত অবস্থা", "Terminal state")}</span>
        </div>
      )}
    </div>
  );
}