"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Activity, Database, Server, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface Health {
  db: "ok" | "error";
  dbLatencyMs: number;
  uptimeSec: number;
  nodeVersion: string;
  now: string;
}

export default function HealthPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin", "system", "health"],
    queryFn: () => api.get("/admin/system/health") as Promise<Health>,
    refetchInterval: 30000,
  });

  const fmtUptime = (sec: number) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("সিস্টেম স্বাস্থ্য", "System Health")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("ডাটাবেস এবং সার্ভারের বর্তমান অবস্থা", "Current state of database and server")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          icon={Database}
          titleBn="ডাটাবেস"
          titleEn="Database"
          status={data?.db === "ok" ? "ok" : "error"}
          statusLabel={data?.db === "ok" ? t("সংযুক্ত", "Connected") : t("ত্রুটি", "Error")}
        >
          <div className="text-xs text-ink-500">
            {data?.dbLatencyMs ?? 0}ms
          </div>
        </HealthCard>

        <HealthCard
          icon={Activity}
          titleBn="লেটেন্সি"
          titleEn="Latency"
          status={data && data.dbLatencyMs < 200 ? "ok" : data && data.dbLatencyMs < 1000 ? "warn" : "error"}
          statusLabel={`${data?.dbLatencyMs ?? 0} ms`}
        >
          <div className="text-xs text-ink-500">
            {data && data.dbLatencyMs < 200
              ? t("ভাল", "Good")
              : data && data.dbLatencyMs < 1000
                ? t("মোটামুটি", "Fair")
                : t("ধীর", "Slow")}
          </div>
        </HealthCard>

        <HealthCard
          icon={Clock}
          titleBn="আপটাইম"
          titleEn="Uptime"
          status="ok"
          statusLabel={fmtUptime(data?.uptimeSec ?? 0)}
        >
          <div className="text-xs text-ink-500">
            {t("সার্ভার চলমান", "Server running")}
          </div>
        </HealthCard>

        <HealthCard
          icon={Server}
          titleBn="নোড সংস্করণ"
          titleEn="Node Version"
          status="ok"
          statusLabel={data?.nodeVersion ?? "—"}
        >
          <div className="text-xs text-ink-500">Node.js</div>
        </HealthCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("বিস্তারিত", "Details")}</CardTitle>
          <CardDescription>
            {t("শেষ আপডেট", "Last updated")}: {data?.now ? new Date(data.now).toLocaleString() : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("ডাটাবেস স্ট্যাটাস", "DB Status")}</td>
                <td className="py-2 text-right">
                  <Badge variant={data?.db === "ok" ? "success" : "danger"}>
                    {data?.db ?? "—"}
                  </Badge>
                </td>
              </tr>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("পিং (ms)", "Ping (ms)")}</td>
                <td className="py-2 text-right font-mono">{data?.dbLatencyMs ?? "—"}</td>
              </tr>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("আপটাইম", "Uptime (s)")}</td>
                <td className="py-2 text-right font-mono">{data?.uptimeSec ?? "—"}</td>
              </tr>
              <tr>
                <td className="py-2 text-ink-500">{t("নোড সংস্করণ", "Node Version")}</td>
                <td className="py-2 text-right font-mono">{data?.nodeVersion ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthCard({
  icon: Icon,
  titleBn,
  titleEn,
  status,
  statusLabel,
  children,
}: {
  icon: any;
  titleBn: string;
  titleEn: string;
  status: "ok" | "warn" | "error";
  statusLabel: string;
  children?: React.ReactNode;
}) {
  const { lang } = useTheme();
  const dotColor =
    status === "ok"
      ? "bg-success-500"
      : status === "warn"
        ? "bg-warning-500"
        : "bg-danger-500";
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <Icon className="h-4 w-4" />
          </div>
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        </div>
        <div>
          <div className="text-xs uppercase text-ink-500">
            {lang === "bn" ? titleBn : titleEn}
          </div>
          <div className="text-lg font-semibold text-ink-900 dark:text-ink-900">
            {statusLabel}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}