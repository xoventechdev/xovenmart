"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt,
  ArrowLeft,
  DollarSign,
  Calendar,
  FileText,
  Bike,
  Plus,
  Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface AuditEntry {
  id: string;
  actorId: string;
  actorRole: string;
  entity: string;
  entityId: string;
  action: string;
  diff: any;
  createdAt: string;
}

export default function FloatHistoryPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // We don't have a dedicated audit-log query endpoint exposed for the rider
  // entity filter. For now we fall back to fetching the cash summary (rich
  // float data per rider). When an audit-log query endpoint exists, swap to it.
  const { data: summary, isLoading } = useQuery({
    queryKey: ["admin", "riders", "cash-summary"],
    queryFn: () => api.get("/admin/riders/cash/summary"),
  });

  const list: any[] = (summary ?? []) as any;

  const totals = useMemo(() => {
    const totalFloat = list.reduce((s, r) => s + (r.currentFloat ?? 0), 0);
    const totalToday = list.reduce((s, r) => s + (r.todayCollected ?? 0), 0);
    return {
      riders: list.length,
      totalFloat,
      totalToday,
    };
  }, [list]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/riders/cash"
            className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" /> {t("ক্যাশ পেজে", "Back to cash")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("ফ্লোট অ্যা�জাস্টমেন্ট", "Float Adjustments")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "রাইডার ফ্লোট পরিবর্তনের ইতিহাস (audit log)",
              "History of rider float changes (from audit log)",
            )}
          </p>
        </div>
        <Link href="/admin/riders">
          <Button variant="outline">
            <Bike className="h-4 w-4" /> {t("সব রাইডার", "All Riders")}
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          icon={<Bike className="h-4 w-4" />}
          label={t("মোট রাইডার", "Total Riders")}
          value={totals.riders}
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label={t("বর্তমান মোট ফ্লোট", "Current Total Float")}
          value={`৳${totals.totalFloat.toLocaleString()}`}
        />
        <Stat
          icon={<Plus className="h-4 w-4" />}
          label={t("আজকের সংগৃহীত", "Today Collected")}
          value={`৳${totals.totalToday.toLocaleString()}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />{" "}
            {t("বর্তমান ফ্লোট অবস্থা", "Current Float Status")}
          </CardTitle>
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
            <div className="space-y-2 p-6 text-center">
              <FileText className="mx-auto h-8 w-8 text-ink-400" />
              <p className="text-sm text-ink-500">
                {t("কোন তথ্য নেই", "No data")}
              </p>
              <p className="text-xs text-ink-500">
                {t(
                  "ফ্লোট অ্যাডজাস্টমেন্টের ইতিহাস দেখতে হলে ক্যাশ সেটেলমেন্ট বা ফ্লোট অপারে�ন করুন",
                  "Perform cash settlement or float operations to populate history",
                )}
              </p>
            </div>
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
                  </tr>
                </thead>
                <tbody>
                  {list.map((r: any) => (
                    <tr
                      key={r.riderId}
                      className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                            <Bike className="h-4 w-4" />
                          </div>
                          <span className="font-medium">{r.name}</span>
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
                          ৳{(r.currentFloat ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ৳{(r.todayCollected ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.unsettledDeliveries > 0 ? (
                          <Badge variant="warning">{r.unsettledDeliveries}</Badge>
                        ) : (
                          <Badge variant="success">0</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-ink-500">
                        {r.lastSettlementAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(r.lastSettlementAt).toLocaleString()}
                          </span>
                        ) : (
                          <Badge variant="danger">{t("কখনো না", "Never")}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("দ্রষ্টব্য", "Note")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-500">
            {t(
              "ফ্�োট অ্যাডজাস্টমেন্টের বিস্তারিত ইতিহাস (কে, কখন, কত টাকা) audit_logs টেবিলে সংরক্�িত হয় action='adjust_float' হিসেবে। নতুন এন্�পয়েন্ট যোগ করে পূর্ণ ইতি�াস দেখানো যাবে।",
              "Detailed float adjustment history (who, when, how much) is stored in audit_logs with action='adjust_float'. A dedicated endpoint can expose full history if needed.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
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