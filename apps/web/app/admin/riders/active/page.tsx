"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  UserCheck,
  UserX,
  Plus,
  Phone,
  Mail,
  ArrowLeft,
  DollarSign,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface Rider {
  id: string;
  name: string;
  email: string;
  phone: string;
  nidNumber?: string | null;
  isActive: boolean;
  currentFloat: number;
  todayDeliveries: number;
  totalDeliveries: number;
  todayCODCollected: number;
  lastActiveAt: string | null;
}

export default function ActiveRidersPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: riders, isLoading } = useQuery({
    queryKey: ["admin", "riders", "all"],
    queryFn: () => api.get("/admin/riders/all"),
  });

  const list: Rider[] = useMemo(
    () => ((riders ?? []) as any[]).filter((r) => r.isActive),
    [riders],
  );

  const todayCOD = list.reduce((s, r) => s + (r.todayCODCollected ?? 0), 0);
  const totalFloat = list.reduce((s, r) => s + (r.currentFloat ?? 0), 0);
  const totalDeliveries = list.reduce(
    (s, r) => s + (r.todayDeliveries ?? 0),
    0,
  );

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
            {t("সক্রিয় রাইডার", "Active Riders")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "শুধুমাত্র সক্রিয় রাইডার — অর্ডার অ্যাসাইনমেন্টের জন্য ব্যবহার করুন",
              "Active riders only — used for order assignment",
            )}
          </p>
        </div>
        <Link href="/admin/riders/new">
          <Button>
            <Plus className="h-4 w-4" /> {t("নতুন রাইডার", "Add Rider")}
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat
          icon={<Bike className="h-4 w-4" />}
          label={t("সক্রিয় রাইডার", "Active Riders")}
          value={list.length}
        />
        <Stat
          icon={<UserCheck className="h-4 w-4" />}
          label={t("আজকের ডেলিভারি", "Today's Deliveries")}
          value={totalDeliveries}
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label={t("আজকের COD", "Today's COD")}
          value={`৳${todayCOD.toLocaleString()}`}
        />
        <Stat
          icon={<Package className="h-4 w-4" />}
          label={t("মোট ফ্লোট", "Total Float")}
          value={`৳${totalFloat.toLocaleString()}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("সক্রিয় রাইডার তালিকা", "Active Riders List")}</CardTitle>
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
              {t("কোন সক্রিয় রাইডার নেই", "No active riders")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-500 dark:border-ink-300 dark:bg-ink-100">
                    <th className="px-3 py-2">{t("নাম", "Name")}</th>
                    <th className="px-3 py-2">{t("যোগাযোগ", "Contact")}</th>
                    <th className="px-3 py-2 text-right">
                      {t("ফ্লোট", "Float")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("আজকের ডেলিভারি", "Today's Deliveries")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("মোট ডেলিভারি", "Total Deliveries")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("শেষ সক্রিয়", "Last Active")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-500/20">
                            <UserCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">{r.name}</div>
                            {r.nidNumber && (
                              <div className="font-mono text-[10px] text-ink-500">
                                NID: {r.nidNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 text-xs">
                          <Mail className="h-3 w-3 text-ink-400" />
                          {r.email}
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3 text-ink-400" />
                          {r.phone}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ৳{(r.currentFloat ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="info">{r.todayDeliveries ?? 0}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.totalDeliveries ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-ink-500">
                        {r.lastActiveAt
                          ? new Date(r.lastActiveAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
        <div className="flex h-9 w-9 items-center justify-center rounded bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-100">
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