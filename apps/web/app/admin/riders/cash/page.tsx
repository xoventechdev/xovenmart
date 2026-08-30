"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  ArrowLeft,
  Plus,
  Minus,
  Receipt,
  Calendar,
  Bike,
  CheckCircle,
  Save,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface CashRow {
  riderId: string;
  name: string;
  currentFloat: number;
  todayCollected: number;
  unsettledDeliveries: number;
  lastSettlementAt: string | null;
}

export default function RiderCashPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [adjusting, setAdjusting] = useState<CashRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "riders", "cash-summary"],
    queryFn: () => api.get("/admin/riders/cash/summary"),
  });

  const list: CashRow[] = (data ?? []) as any;

  const totalFloat = list.reduce((s, r) => s + r.currentFloat, 0);
  const totalToday = list.reduce((s, r) => s + r.todayCollected, 0);
  const totalUnsettled = list.reduce((s, r) => s + r.unsettledDeliveries, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/riders"
            className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" /> {t("সব রাইডার", "All Riders")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("রাইডার ক্যাশ", "Rider Cash")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "ফ্লোট ব্যবস্থা�না ও নগদ সেটেলমেন্ট",
              "Float management and cash settlement",
            )}
          </p>
        </div>
        <Link href="/admin/riders/floats">
          <Button variant="outline">
            <Receipt className="h-4 w-4" /> {t("ফ্লোট ইতিহাস", "Float History")}
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label={t("মোট বকেয়া ফ্লোট", "Total Outstanding Float")}
          value={`৳${totalFloat.toLocaleString()}`}
          color="warning"
        />
        <Stat
          icon={<Plus className="h-4 w-4" />}
          label={t("আজকের সংগ্রহ", "Today's Collected")}
          value={`৳${totalToday.toLocaleString()}`}
          color="success"
        />
        <Stat
          icon={<Receipt className="h-4 w-4" />}
          label={t("আনসেটেলড ডে�িভারি", "Unsettled Deliveries")}
          value={totalUnsettled}
          color="info"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("ক্যাশ বিবরণ", "Cash Breakdown")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200"
                />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {t("কোন রাইডার নেই", "No riders")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-500 dark:border-ink-300 dark:bg-ink-100">
                    <th className="px-3 py-2">{t("রাইডার", "Rider")}</th>
                    <th className="px-3 py-2 text-right">
                      {t("বর্তমান ফ্লোট", "Current Float")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("আজকের সংগৃহীত", "Today Collected")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("আনসেটেলড", "Unsettled")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("শেষ সেটেলমেন্ট", "Last Settlement")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("কর্ম", "Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.riderId}
                      className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                            <Bike className="h-4 w-4" />
                          </div>
                          <div className="font-medium">{r.name}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        <span
                          className={
                            r.currentFloat > 0
                              ? "font-semibold text-warning-700"
                              : "text-ink-500"
                          }
                        >
                          ৳{r.currentFloat.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ৳{r.todayCollected.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.unsettledDeliveries > 0 ? (
                          <Badge variant="warning">
                            {r.unsettledDeliveries}
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            <CheckCircle className="mr-1 h-3 w-3" /> 0
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-ink-500">
                        {r.lastSettlementAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(r.lastSettlementAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <Badge variant="danger">{t("কখনো না", "Never")}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAdjusting(r)}
                          >
                            <DollarSign className="h-3.5 w-3.5" />{" "}
                            {t("অ্যাডজাস্ট", "Adjust")}
                          </Button>
                          <Link href="/admin/orders/cash-settlements">
                            <Button variant="ghost" size="sm">
                              <Receipt className="h-3.5 w-3.5" />{" "}
                              {t("সেটেল", "Settle")}
                            </Button>
                          </Link>
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

      {adjusting && (
        <FloatAdjustModal
          row={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}

function FloatAdjustModal({
  row,
  onClose,
}: {
  row: CashRow;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api.post("/admin/riders/floats", {
        riderId: row.riderId,
        amount:
          (direction === "add" ? 1 : -1) * Number(amount || 0),
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success(t("ফ্লোট আপডেট হয়েছে", "Float updated"));
      qc.invalidateQueries({ queryKey: ["admin", "riders"] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  const valid = Number(amount) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <div>
            <h2 className="font-semibold">{t("ফ্লোট অ্যাডজাস্ট", "Adjust Float")}</h2>
            <p className="text-xs text-ink-500">{row.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-md bg-ink-50 p-3 dark:bg-ink-100">
            <div className="text-xs text-ink-500">
              {t("বর্তমান ফ্লোট", "Current Float")}
            </div>
            <div className="text-lg font-semibold">
              ৳{row.currentFloat.toLocaleString()}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t("ধরন", "Direction")}</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("add")}
                className={`flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  direction === "add"
                    ? "border-success-500 bg-success-100 text-success-700 dark:bg-success-500/20"
                    : "border-ink-200 dark:border-ink-300"
                }`}
              >
                <Plus className="h-4 w-4" /> {t("দেওয়া", "Give")}
              </button>
              <button
                type="button"
                onClick={() => setDirection("subtract")}
                className={`flex items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  direction === "subtract"
                    ? "border-danger-500 bg-danger-100 text-danger-700 dark:bg-danger-500/20"
                    : "border-ink-200 dark:border-ink-300"
                }`}
              >
                <Minus className="h-4 w-4" /> {t("নেওয়া", "Reclaim")}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t("পরিমাণ (৳)", "Amount (৳)")}</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="text-sm font-medium">{t("নোট (ঐচ্ছিক)", "Note (optional)")}</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(
                "যেমন: সকালের বিকাশ ভাঙানো",
                "e.g. Morning change given",
              )}
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !valid}
          >
            <Save className="h-4 w-4" /> {t("অ্যাডজাস্ট", "Adjust")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: "warning" | "success" | "info";
}) {
  const colorMap: Record<string, string> = {
    success:
      "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-100",
    info: "bg-info-100 text-info-700 dark:bg-info-500/20 dark:text-info-100",
    warning:
      "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded ${colorMap[color]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-500">{label}</div>
          <div className="truncate text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}