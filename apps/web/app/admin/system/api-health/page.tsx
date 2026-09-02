"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Database,
  HardDrive,
  Mail,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────

interface Memory {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
}

interface RecentError {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  diff: any;
  createdAt: string;
}

interface ApiHealth {
  now: string;
  uptimeSec: number;
  nodeVersion: string;
  platform: string;
  memory: Memory;
  db: { status: "ok" | "error"; latencyMs: number; error?: string };
  lastBackup: {
    fileName: string;
    status: string;
    finishedAt: string | null;
    durationMs: number | null;
    trigger: string;
    error: string | null;
  } | null;
  smtp: {
    total: number;
    active: number;
    default: string | null;
    purposesAssigned: number;
  };
  backupLock: boolean;
  recentErrors: RecentError[];
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtBytes(mb: number) {
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fmtAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "—";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function describeError(r: RecentError): string {
  const d: any = r.diff ?? {};
  if (d.errorCode) return `${d.errorCode}: ${d.error || d.message || "(no detail)"}`;
  if (d.error) return String(d.error);
  if (d.status === "FAILED") return "FAILED";
  return r.action;
}

// ─── Page ─────────────────────────────────────────────────────

export default function ApiHealthPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "system", "api-health"],
    queryFn: () => api.get("/admin/system/api-health") as Promise<ApiHealth>,
    refetchInterval: 10_000,
  });

  const dbStatus = data?.db.status ?? "ok";
  const dbLatencyMs = data?.db.latencyMs ?? 0;

  // Overall status — any single "error" wins.
  const overall: "ok" | "warn" | "error" =
    !data
      ? "ok"
      : dbStatus === "error"
        ? "error"
        : data.backupLock
          ? "warn"
          : (data.recentErrors?.length ?? 0) > 0
            ? "warn"
            : "ok";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
              {t("API স্বাস্থ্য", "API Health")}
            </h1>
            <Badge
              variant={
                overall === "ok" ? "success" : overall === "warn" ? "warning" : "danger"
              }
            >
              {overall === "ok"
                ? t("সব ঠিক আছে", "All good")
                : overall === "warn"
                  ? t("মনোযোগ দরকার", "Needs attention")
                  : t("ত্রুটি", "Error")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "API, ডাটাবেস, ব্যাকআপ এবং SMTP-এর লাইভ অবস্থা",
              "Live status of API, database, backups and SMTP",
            )}
            {dataUpdatedAt > 0 && (
              <>
                {" · "}
                {t("শেষ আপডেট", "Updated")}: {new Date(dataUpdatedAt).toLocaleTimeString()}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      {/* Top row: 4 small summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Database}
          titleBn="ডাটাবেস"
          titleEn="Database"
          status={dbStatus === "ok" ? "ok" : "error"}
          statusLabel={
            dbStatus === "ok" ? t("সংযুক্ত", "Connected") : t("ত্রুটি", "Error")
          }
        >
          <div className="text-xs text-ink-500">
            {dbLatencyMs} ms
            {dbLatencyMs < 200
              ? ` · ${t("ভাল", "Good")}`
              : dbLatencyMs < 1000
                ? ` · ${t("মোটামুটি", "Fair")}`
                : ` · ${t("ধীর", "Slow")}`}
          </div>
          {dbStatus === "error" && data?.db.error && (
            <div className="mt-1 truncate text-xs text-danger-600" title={data.db.error}>
              {data.db.error}
            </div>
          )}
        </SummaryCard>

        <SummaryCard
          icon={Activity}
          titleBn="আপটাইম"
          titleEn="Uptime"
          status="ok"
          statusLabel={fmtUptime(data?.uptimeSec ?? 0)}
        >
          <div className="text-xs text-ink-500">
            {t("প্রক্রিয়া চলমান", "Process running")}
          </div>
        </SummaryCard>

        <SummaryCard
          icon={Server}
          titleBn="মেমোরি (RSS)"
          titleEn="Memory (RSS)"
          status={data && data.memory.rssMb > 1024 ? "warn" : "ok"}
          statusLabel={fmtBytes(data?.memory.rssMb ?? 0)}
        >
          <div className="text-xs text-ink-500">
            {t("হিপ ব্যবহৃত", "Heap used")}: {fmtBytes(data?.memory.heapUsedMb ?? 0)} /{" "}
            {fmtBytes(data?.memory.heapTotalMb ?? 0)}
          </div>
        </SummaryCard>

        <SummaryCard
          icon={ShieldAlert}
          titleBn="সাম্প্রতিক ত্রুটি"
          titleEn="Recent Errors"
          status={
            !data || (data.recentErrors?.length ?? 0) === 0
              ? "ok"
              : (data.recentErrors?.length ?? 0) > 3
                ? "error"
                : "warn"
          }
          statusLabel={String(data?.recentErrors?.length ?? 0)}
        >
          <div className="text-xs text-ink-500">
            {t("শেষ ৮০ অডিটের মধ্যে", "Out of last 80 audits")}
          </div>
        </SummaryCard>
      </div>

      {/* Backup card — wide */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            {t("ব্যাকআপ", "Backups")}
          </CardTitle>
          <CardDescription>
            {t(
              "শেষ ব্যাকআপ এবং চলমান রান",
              "Last backup and any currently running job",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.backupLock ? (
            <div className="mb-3 flex items-start gap-2 rounded border border-warning-200 bg-warning-50 p-3 text-sm dark:border-warning-700 dark:bg-warning-900/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning-600" />
              <div>
                <div className="font-medium text-warning-700 dark:text-warning-300">
                  {t("ব্যাকআপ চলছে", "A backup is currently running")}
                </div>
                <div className="text-xs text-warning-600 dark:text-warning-400">
                  {t(
                    "পুনরায় ব্যাকআপ শুরু করার চেষ্টা করবেন না — পেজটি স্বয়ংক্রিয়ভাবে আপডেট হবে।",
                    "Do not start another backup — this page auto-refreshes.",
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {!data?.lastBackup ? (
            <div className="text-sm text-ink-500">
              {t("কোনও ব্যাকআপ এখনও তৈরি হয়নি", "No backups yet")}
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-ink-200 dark:border-ink-300">
                  <td className="py-2 text-ink-500">{t("ফাইল", "File")}</td>
                  <td className="py-2 text-right font-mono text-xs">
                    {data.lastBackup.fileName}
                  </td>
                </tr>
                <tr className="border-b border-ink-200 dark:border-ink-300">
                  <td className="py-2 text-ink-500">{t("স্ট্যাটাস", "Status")}</td>
                  <td className="py-2 text-right">
                    <Badge
                      variant={
                        data.lastBackup.status === "SUCCESS"
                          ? "success"
                          : data.lastBackup.status === "FAILED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {data.lastBackup.status}
                    </Badge>
                  </td>
                </tr>
                <tr className="border-b border-ink-200 dark:border-ink-300">
                  <td className="py-2 text-ink-500">{t("ট্রিগার", "Trigger")}</td>
                  <td className="py-2 text-right">{data.lastBackup.trigger}</td>
                </tr>
                <tr className="border-b border-ink-200 dark:border-ink-300">
                  <td className="py-2 text-ink-500">
                    {t("শেষ হয়েছে", "Finished")}
                  </td>
                  <td className="py-2 text-right">
                    {data.lastBackup.finishedAt
                      ? `${new Date(data.lastBackup.finishedAt).toLocaleString()} (${fmtAgo(data.lastBackup.finishedAt)})`
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-ink-500">{t("সময়কাল", "Duration")}</td>
                  <td className="py-2 text-right font-mono">
                    {data.lastBackup.durationMs != null
                      ? `${(data.lastBackup.durationMs / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                </tr>
                {data.lastBackup.error && (
                  <tr>
                    <td className="py-2 text-ink-500">{t("ত্রুটি", "Error")}</td>
                    <td className="py-2 text-right text-xs text-danger-600">
                      {data.lastBackup.error}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* SMTP card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {t("SMTP প্রোভাইডার", "SMTP Providers")}
          </CardTitle>
          <CardDescription>
            {t(
              "ইমেইল পাঠানোর জন্য কনফিগার করা প্রোভাইডারগুলো",
              "Providers configured for outbound email",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat
              label={t("মোট প্রোভাইডার", "Total providers")}
              value={data?.smtp.total ?? 0}
            />
            <Stat
              label={t("সক্রিয়", "Active")}
              value={data?.smtp.active ?? 0}
              tone={
                (data?.smtp.active ?? 0) === 0
                  ? "danger"
                  : (data?.smtp.active ?? 0) < (data?.smtp.total ?? 1)
                    ? "warn"
                    : "ok"
              }
            />
            <Stat
              label={t("ডিফল্ট", "Default")}
              value={data?.smtp.default ?? t("—", "—")}
            />
            <Stat
              label={t("উদ্দেশ্য বরাদ্দ", "Purposes assigned")}
              value={`${data?.smtp.purposesAssigned ?? 0} / 4`}
              tone={(data?.smtp.purposesAssigned ?? 0) === 0 ? "warn" : "ok"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Recent errors list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t("সাম্প্রতিক ত্রুটি", "Recent Errors")}
          </CardTitle>
          <CardDescription>
            {t(
              "অডিট লগ থেকে স্বয়ংক্রিয়ভাবে সংগৃহীত",
              "Auto-collected from the audit log",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data || data.recentErrors.length === 0 ? (
            <div className="text-sm text-ink-500">
              {t("কোনও সাম্প্রতিক ত্রুটি নেই", "No recent errors")}
            </div>
          ) : (
            <ul className="space-y-2">
              {data.recentErrors.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start gap-3 rounded border border-ink-200 p-3 text-sm dark:border-ink-300"
                >
                  <Badge variant="danger" className="mt-0.5 shrink-0">
                    {r.entity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-ink-700 dark:text-ink-700">
                      {r.action} · {r.entityId.slice(0, 12)}
                      {r.entityId.length > 12 ? "…" : ""}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">{describeError(r)}</div>
                  </div>
                  <div className="shrink-0 text-xs text-ink-500">
                    {fmtAgo(r.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("সার্ভারের তথ্য", "Server Details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("নোড সংস্করণ", "Node version")}</td>
                <td className="py-2 text-right font-mono">{data?.nodeVersion ?? "—"}</td>
              </tr>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("প্ল্যাটফর্ম", "Platform")}</td>
                <td className="py-2 text-right font-mono">{data?.platform ?? "—"}</td>
              </tr>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("আপটাইম (সেকেন্ড)", "Uptime (s)")}</td>
                <td className="py-2 text-right font-mono">{data?.uptimeSec ?? "—"}</td>
              </tr>
              <tr className="border-b border-ink-200 dark:border-ink-300">
                <td className="py-2 text-ink-500">{t("হিপ ব্যবহার", "Heap used / total")}</td>
                <td className="py-2 text-right font-mono">
                  {data ? `${data.memory.heapUsedMb.toFixed(1)} / ${data.memory.heapTotalMb.toFixed(1)} MB` : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-ink-500">RSS</td>
                <td className="py-2 text-right font-mono">
                  {data ? `${data.memory.rssMb.toFixed(1)} MB` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function SummaryCard({
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
          <div className="truncate text-lg font-semibold text-ink-900 dark:text-ink-900">
            {statusLabel}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-danger-600"
      : tone === "warn"
        ? "text-warning-600"
        : "text-ink-900 dark:text-ink-900";
  return (
    <div className="rounded border border-ink-200 p-3 dark:border-ink-300">
      <div className="text-xs uppercase text-ink-500">{label}</div>
      <div className={`mt-1 truncate text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}