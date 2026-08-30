"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Mail,
  Truck,
  Save,
  AlertCircle,
  CheckCircle2,
  Clock,
  User as UserIcon,
  Package,
  MessageSquare,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  OrderStatusBadge,
  ALLOWED_TRANSITIONS,
  STATUS_MAP,
  type OrderStatus,
} from "@/components/admin/order-status-badge";
import { CopyButton } from "@/components/copy-button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT, formatDateTime, relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { SupplierPicker } from "@/app/admin/suppliers/_components/supplier-picker";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: () => api.get(`/admin/orders/${id}`),
  });

  const { data: riders } = useQuery({
    queryKey: ["admin", "riders"],
    queryFn: () => api.get("/admin/riders"),
  });

  const [note, setNote] = useState("");
  const [selectedRider, setSelectedRider] = useState("");

  const updateStatus = useMutation({
    mutationFn: (vars: { status: OrderStatus; note?: string }) =>
      api.patch(`/orders/${id}/status`, vars),
    onSuccess: () => {
      toast.success(t("স্ট্যাটাস আপডেট হয়েছে", "Status updated"));
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "order", id] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Update failed"),
  });

  const assignRider = useMutation({
    mutationFn: (vars: { riderId: string }) =>
      api.post(`/admin/orders/${id}/assign-rider`, vars),
    onSuccess: () => {
      toast.success(t("রাইডার নিযুক্ত হয়েছে", "Rider assigned"));
      qc.invalidateQueries({ queryKey: ["admin", "order", id] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Assign failed"),
  });

  if (isLoading || !order) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-32 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        <div className="h-32 animate-pulse rounded-md bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  const allowedNext = ALLOWED_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/orders/all"
            className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" /> {t("অর্ডার তালিকায় ফিরুন", "Back to orders")}
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold text-ink-900 dark:text-ink-900">
              #{order.orderNo}
            </h1>
            <CopyButton value={order.orderNo} size="lg" />
            <OrderStatusBadge status={order.status} lang={lang} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {t("অর্ডার করা হয়েছে", "Placed")} {relativeTime(order.placedAt, lang)} •{" "}
            {formatDateTime(order.placedAt, lang)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT: customer + items + timeline */}
        <div className="space-y-4 lg:col-span-2">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                {t("আইটেম", "Items")} ({order.items?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(order.items ?? []).map((it: any, i: number) => (
                <div
                  key={i}
                  className="space-y-2 rounded-md border border-ink-200 p-3 dark:border-ink-300"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                        <Package className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-ink-900 dark:text-ink-900">{it.nameSnapshot}</div>
                        <div className="text-xs text-ink-500">
                          {formatBDT(it.unitPrice)} × {it.qty}
                        </div>
                      </div>
                    </div>
                    <div className="font-bold text-ink-900 dark:text-ink-900">
                      {formatBDT(it.lineTotal)}
                    </div>
                  </div>
                  <SupplierPicker
                    orderItem={{
                      id: it.id,
                      qty: it.qty,
                      productId: it.productId,
                      nameSnapshot: it.nameSnapshot,
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Customer & Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                {t("কাস্টমার ও ঠিকানা", "Customer & Address")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  icon={UserIcon}
                  label={t("নাম", "Name")}
                  value={order.user?.name || order.guestName || t("গেস্ট", "Guest")}
                />
                <Field
                  icon={Phone}
                  label={t("ফোন", "Phone")}
                  value={order.user?.phone || order.guestPhone || "—"}
                  mono
                />
                <Field
                  icon={Mail}
                  label={t("ইমেইল", "Email")}
                  value={order.user?.email || t("প্রদান করা হয়নি", "Not provided")}
                />
                <Field
                  icon={Receipt}
                  label={t("পেমেন্ট", "Payment")}
                  value={`${order.paymentMethod} • ${order.paymentStatus}`}
                />
              </div>
              {order.address && (
                <div className="rounded-md border border-ink-200 p-3 dark:border-ink-300">
                  <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500">
                    <MapPin className="h-3 w-3" /> {t("ডেলিভারি ঠিকানা", "Delivery Address")}
                  </div>
                  <div className="text-sm text-ink-900 dark:text-ink-900">
                    {order.address.line1}
                    {order.address.line2 && <>, {order.address.line2}</>}
                  </div>
                  <div className="text-xs text-ink-500">
                    {order.address.area}, {order.address.city}
                    {order.address.postcode && ` - ${order.address.postcode}`}
                  </div>
                </div>
              )}
              {order.notes && (
                <div className="rounded-md bg-warning-100 p-3 text-xs dark:bg-warning-500/20">
                  <div className="mb-1 inline-flex items-center gap-1 font-semibold text-warning-700">
                    <MessageSquare className="h-3 w-3" /> {t("নোট", "Notes")}
                  </div>
                  <div className="text-ink-700 dark:text-ink-900">{order.notes}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("স্ট্যাটাস টাইমলাইন", "Status Timeline")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <OrderStatusStepper current={order.status as OrderStatus} lang={lang} />
              {(order.statusEvents ?? []).length === 0 ? (
                <p className="text-sm text-ink-500">{t("কোন ইভেন্ট নেই", "No events yet")}</p>
              ) : (
                <ol className="space-y-3 border-t border-ink-200 pt-4 dark:border-ink-300">
                  {[...order.statusEvents]
                    .sort(
                      (a: any, b: any) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    )
                    .map((e: any, i: number) => (
                      <li key={e.id ?? i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={`h-3 w-3 rounded-full ${
                              STATUS_MAP[e.toStatus as OrderStatus]?.dotClass ?? "bg-ink-400"
                            }`}
                          />
                          {i < (order.statusEvents?.length ?? 0) - 1 && (
                            <span className="my-1 h-8 w-px bg-ink-200 dark:bg-ink-300" />
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <OrderStatusBadge status={e.toStatus} lang={lang} />
                            <span className="text-xs text-ink-500">
                              {relativeTime(e.createdAt, lang)}
                            </span>
                            {e.actorRole && (
                              <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink-700 dark:bg-ink-200 dark:text-ink-900">
                                {e.actorRole}
                              </span>
                            )}
                          </div>
                          {e.fromStatus && (
                            <div className="text-xs text-ink-500">
                              {STATUS_MAP[e.fromStatus as OrderStatus]?.bn ?? e.fromStatus} →{" "}
                              {STATUS_MAP[e.toStatus as OrderStatus]?.bn ?? e.toStatus}
                            </div>
                          )}
                          {e.note && (
                            <div className="mt-1 text-xs italic text-ink-500">"{e.note}"</div>
                          )}
                          <div className="mt-0.5 text-[10px] text-ink-400">
                            {formatDateTime(e.createdAt, lang)}
                          </div>
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: actions + rider + summary */}
        <div className="space-y-4">
          {/* Status update */}
          <Card>
            <CardHeader>
              <CardTitle>{t("স্ট্যাটাস পরিবর্তন", "Change Status")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allowedNext.length === 0 ? (
                <div className="rounded-md bg-ink-100 p-3 text-xs text-ink-500 dark:bg-ink-200">
                  <AlertCircle className="mr-1 inline h-3 w-3" />
                  {t("এই অর্ডার চূড়ান্ত — আর পরিবর্তন সম্ভব নয়", "Final state — no further transitions allowed")}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {allowedNext.map((s) => (
                      <Button
                        key={s}
                        variant={s === "CANCELLED" ? "outline" : "default"}
                        size="sm"
                        disabled={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ status: s, note })}
                        className={s === "CANCELLED" ? "border-danger-500 text-danger-700 hover:bg-danger-100" : ""}
                      >
                        {updateStatus.isPending && updateStatus.variables?.status === s ? (
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <>
                            {s === "DELIVERED" && <CheckCircle2 className="h-3 w-3" />}
                            {t(STATUS_MAP[s].bn, STATUS_MAP[s].en)}
                          </>
                        )}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink-700 dark:text-ink-900">
                      {t("নোট (ঐচ্ছিক)", "Note (optional)")}
                    </label>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("যেমন: কাস্টমার ফোন পায়নি", "e.g., Customer unreachable")}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Rider assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                {t("রাইডার", "Rider")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.delivery?.rider ? (
                <div className="rounded-md border border-success-200 bg-success-100 p-3 dark:border-success-500/30 dark:bg-success-500/20">
                  <div className="font-semibold text-success-700">{order.delivery.rider.name}</div>
                  <div className="text-xs text-success-700">
                    {t("নিযুক্ত", "Assigned")} {relativeTime(order.delivery.assignedAt, lang)}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-500">{t("কোন রাইডার নিযুক্ত হয়নি", "No rider assigned")}</p>
              )}
              <select
                value={selectedRider}
                onChange={(e) => setSelectedRider(e.target.value)}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                <option value="">{t("— রাইডার নির্বাচন করুন —", "— Select rider —")}</option>
                {(riders ?? []).filter((r: any) => r.isActive).map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.phone})
                  </option>
                ))}
              </select>
              <Button
                onClick={() => selectedRider && assignRider.mutate({ riderId: selectedRider })}
                disabled={!selectedRider || assignRider.isPending}
                className="w-full"
              >
                <Save className="h-4 w-4" />
                {assignRider.isPending
                  ? t("সংরক্ষণ হচ্ছে...", "Saving...")
                  : t("রাইডার নিযুক্ত করুন", "Assign Rider")}
              </Button>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>{t("পেমেন্ট সারসংক্ষেপ", "Payment Summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t("সাবটোটাল", "Subtotal")} value={formatBDT(order.subtotal)} />
              {Number(order.discountTotal) > 0 && (
                <Row
                  label={`${t("ডিসকাউন্ট", "Discount")}${order.couponCode ? ` (${order.couponCode})` : ""}`}
                  value={`- ${formatBDT(order.discountTotal)}`}
                  accent="success"
                />
              )}
              <Row label={t("ডেলিভারি ফি", "Delivery Fee")} value={formatBDT(order.deliveryFee)} />
              <div className="border-t border-ink-200 pt-2 dark:border-ink-300" />
              <Row
                label={t("সর্বমোট", "Grand Total")}
                value={formatBDT(order.grandTotal)}
                bold
                size="lg"
              />
              <div className="pt-2">
                <Badge variant={order.paymentStatus === "VERIFIED" ? "success" : "warning"}>
                  {order.paymentMethod} • {order.paymentStatus}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Visual horizontal stepper showing all known order statuses.
 * Current step is highlighted; past steps are checked; future steps are muted.
 * Branches like CANCELLED / RETURNED / REFUNDED are rendered as a side-state badge.
 */
function OrderStatusStepper({ current, lang }: { current: OrderStatus; lang: "bn" | "en" }) {
  const STEPS: OrderStatus[] = [
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    "PREPARED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  const TERMINAL_BAD: OrderStatus[] = ["CANCELLED", "RETURNED", "REFUNDED"];

  const isTerminalBad = TERMINAL_BAD.includes(current);
  const currentIdx = STEPS.indexOf(current);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((s, i) => {
          const isCurrent = s === current;
          const isPast = !isTerminalBad && currentIdx >= 0 && i < currentIdx;
          const isFuture = !isTerminalBad && (currentIdx < 0 || i > currentIdx);
          const meta = STATUS_MAP[s];
          return (
            <div key={s} className="flex items-center gap-1.5">
              <div
                className={[
                  "flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-bold",
                  isCurrent
                    ? `${meta?.dotClass ?? "bg-primary-700"} text-white`
                    : isPast
                      ? `${meta?.dotClass ?? "bg-primary-700"} text-white opacity-80`
                      : isFuture
                        ? "bg-ink-100 text-ink-500 dark:bg-ink-200"
                        : "bg-ink-100 text-ink-500 dark:bg-ink-200",
                ].join(" ")}
                title={meta ? lang === "bn" ? meta.bn : meta.en : s}
              >
                {i + 1}
              </div>
              <span
                className={`text-[11px] ${
                  isCurrent
                    ? "font-bold text-ink-900 dark:text-ink-900"
                    : isPast
                      ? "text-ink-700 dark:text-ink-900"
                      : "text-ink-500"
                }`}
              >
                {meta ? (lang === "bn" ? meta.bn : meta.en) : s}
              </span>
              {i < STEPS.length - 1 && (
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
          <span className="font-semibold">
            {(STATUS_MAP[current]?.bn && lang === "bn" ? STATUS_MAP[current].bn : STATUS_MAP[current]?.en) ?? current}
          </span>
          <span className="text-danger-700/80">· {lang === "bn" ? "চূড়ান্ত অবস্থা" : "terminal state"}</span>
        </div>
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: any;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div className="min-w-0">
        <div className="text-xs text-ink-500">{label}</div>
        <div className={`truncate text-sm text-ink-900 dark:text-ink-900 ${mono ? "font-mono" : "font-medium"}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  size,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  size?: "sm" | "lg";
  accent?: "success" | "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span
        className={
          bold
            ? `font-bold ${size === "lg" ? "text-lg" : ""} ${
                accent === "success"
                  ? "text-success-700"
                  : accent === "danger"
                  ? "text-danger-700"
                  : "text-ink-900 dark:text-ink-900"
              }`
            : accent === "success"
            ? "text-success-700"
            : "text-ink-900 dark:text-ink-900"
        }
      >
        {value}
      </span>
    </div>
  );
}
