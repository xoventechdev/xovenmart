"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  HardDrive,
  Loader2,
  RotateCcw,
  Save,
  ScanSearch,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { RestoreModal } from "@/components/admin/restore-modal";
import { useTheme } from "@/lib/theme";
import { api, extractApiMessage } from "@/lib/api";
import { toast } from "sonner";

interface BackupRow {
  id: string;
  fileName: string;
  storagePath: string;
  sizeBytes: string; // BigInt as string
  mode: "MANUAL" | "SCHEDULED";
  trigger: "USER" | "CRON" | "SYSTEM_RESTORE_SAFETY";
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  notes: string | null;
  createdBy: { id: string; name: string; email: string } | null;
}

interface BackupStats {
  total: number;
  successLast7: number;
  failedLast7: number;
  totalBytes: number;
}

interface BackupSettings {
  retentionDays: number;
  scheduledEnabled: boolean;
}

interface ListResponse {
  items: BackupRow[];
  page: number;
  perPage: number;
  total: number;
  stats: BackupStats;
}

/**
 * Admin DB backup & restore console.
 *
 * Endpoints used:
 *   GET    /admin/system/backups            — paginated list + stats
 *   POST   /admin/system/backups            — manual "Backup now"
 *   POST   /admin/system/backups/scan       — rescan BACKUP_DIR (admin JWT)
 *   GET    /admin/system/backups/:id/download — binary stream
 *   DELETE /admin/system/backups/:id        — delete one
 *   POST   /admin/system/backups/:id/restore        — dry-run preview
 *   POST   /admin/system/backups/:id/restore/execute — safety-dump + restore
 *   GET    /admin/system/backup-settings    — retention + scheduledEnabled
 *   PATCH  /admin/system/backup-settings    — save above
 *
 * The "Backup now" button triggers an immediate manual pg_dump. The
 * nightly scheduled backup runs via OS cron (`infra/vps/backup.sh`)
 * and shows up here with mode=SCHEDULED, trigger=CRON. Both paths
 * write to the same table so the admin sees one unified history.
 */
export default function BackupsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<"" | "RUNNING" | "SUCCESS" | "FAILED">("");
  const [modeFilter, setModeFilter] = useState<"" | "MANUAL" | "SCHEDULED">("");
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);

  const listKey = ["admin", "system", "backups", page, perPage, statusFilter, modeFilter];

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("perPage", String(perPage));
      if (statusFilter) qs.set("status", statusFilter);
      if (modeFilter) qs.set("mode", modeFilter);
      return api.get(`/admin/system/backups?${qs.toString()}`) as Promise<ListResponse>;
    },
    refetchInterval: (q: { state: { data: unknown } }) => {
      // Poll every 3s while any row is RUNNING so the user sees live progress.
      const items = ((q.state.data as ListResponse | undefined)?.items ?? []) as BackupRow[];
      return items.some((r) => r.status === "RUNNING") ? 3000 : false;
    },
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin", "system", "backup-settings"],
    queryFn: () => api.get("/admin/system/backup-settings") as Promise<BackupSettings>,
  });

  // Proactive Postgres-tools health check. The same endpoint is the
  // source of truth for the 503 message the click-time toast surfaces,
  // so the visible hint here and the toast can't drift apart. 60 s
  // staleTime is plenty — admins don't reinstall Postgres every few
  // seconds, and the page reload on navigation re-fetches immediately.
  const { data: toolsHealth } = useQuery({
    queryKey: ["admin", "system", "backup-tools", "health"],
    queryFn: () =>
      api.get("/admin/system/backup-tools/health") as Promise<{
        pgDump: boolean;
        pgRestore: boolean;
        ok: boolean;
        missing: string[];
        platform: string;
        installHint: string;
      }>,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const [form, setForm] = useState<BackupSettings>({ retentionDays: 7, scheduledEnabled: true });
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: (next: BackupSettings) =>
      api.patch("/admin/system/backup-settings", next) as Promise<BackupSettings>,
    onSuccess: (next) => {
      toast.success(t("সংরক্ষিত", "Saved"));
      setForm(next);
      qc.setQueryData(["admin", "system", "backup-settings"], next);
    },
    onError: (e) => toast.error(extractApiMessage(e, "Save failed")),
  });

  const runBackup = useMutation({
    mutationFn: () => api.post("/admin/system/backups") as Promise<{ id: string }>,
    onSuccess: () => {
      toast.success(t("ব্যাকআপ শুরু হয়েছে", "Backup started"));
      setPage(1);
      qc.invalidateQueries({ queryKey: ["admin", "system", "backups"] });
    },
    onError: (e: any) => {
      const code = e?.data?.errorCode as string | undefined;
      const msg = extractApiMessage(e, "Backup failed to start");
      // Special-case: pg tools missing → toast with a longer description
      // and no auto-dismiss, so the admin has time to read the install path.
      if (code === "pg_tools_missing") {
        toast.error(msg, {
          description: t(
            "পোস্টগ্রেস CLI টুলস PATH-তে নেই। পোস্টগ্রেস ইনস্টল করে PATH আপডেট করে API রিস্টার্ট করুন।",
            "Postgres client tools are missing on the server. Install Postgres and add its bin/ to PATH, then restart the API.",
          ),
          duration: 15000,
        });
        return;
      }
      toast.error(msg);
    },
  });

  const scan = useMutation({
    mutationFn: () => api.post("/admin/system/backups/scan") as Promise<{ added: number; skipped: number }>,
    onSuccess: (r) => {
      toast.success(t(`${r.added} টি নতুন যোগ, ${r.skipped} টি বাদ`, `${r.added} added, ${r.skipped} skipped`));
      qc.invalidateQueries({ queryKey: ["admin", "system", "backups"] });
    },
    onError: (e) => toast.error(extractApiMessage(e, "Scan failed")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/system/backups/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "system", "backups"] });
    },
    onError: (e) => toast.error(extractApiMessage(e, "Delete failed")),
  });

  async function download(id: string, fileName: string) {
    try {
      const res = await fetch(`${resolveApiBase()}/admin/system/backups/${id}/download`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        toast.error(text || "Download failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    }
  }

  const items: BackupRow[] = (data as ListResponse | undefined)?.items ?? [];
  const stats = (data as ListResponse | undefined)?.stats;
  const total = (data as ListResponse | undefined)?.total ?? 0;
  const runningRow = items.find((r) => r.status === "RUNNING") ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("ডাটাবেস ব্যাকআপ", "Database Backups")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "PostgreSQL ডাম্প ম্যানুয়ালি অথবা ০৩:০০ OS ক্রনের মাধ্যমে।",
              "PostgreSQL dumps — manual or via 03:00 OS cron.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="h-4 w-4" />
            )}
            {scan.isPending ? t("স্ক্যান হচ্ছে...", "Scanning...") : t("স্ক্যান ডিস্ক", "Scan disk")}
          </Button>
          <Button
            onClick={() => runBackup.mutate()}
            disabled={runBackup.isPending || !!runningRow}
            title={
              runningRow
                ? t("একটি ব্যাকআপ চলছে", "A backup is already running")
                : undefined
            }
          >
            {runBackup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {runBackup.isPending
              ? t("চলছে...", "Running...")
              : runningRow
              ? t("ইতিমধ্যে চলছে", "Already running")
              : t("ব্যাকআপ নাও", "Backup now")}
          </Button>
        </div>
      </div>

      {/* Ongoing backup banner — visible whenever any row is RUNNING,
          regardless of which tab triggered it. The list auto-polls
          every 3s while this is true. */}
      <RunningBanner row={runningRow} t={t} />

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            icon={<Database className="h-4 w-4" />}
            label={t("মোট ব্যাকআপ", "Total backups")}
            value={String(stats.total)}
            tone="default"
          />
          <Stat
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={t("সফল (৭ দিন)", "Success (7d)")}
            value={String(stats.successLast7)}
            tone="success"
          />
          <Stat
            icon={<XCircle className="h-4 w-4" />}
            label={t("ব্যর্থ (৭ দিন)", "Failed (7d)")}
            value={String(stats.failedLast7)}
            tone={stats.failedLast7 > 0 ? "danger" : "default"}
          />
          <Stat
            icon={<HardDrive className="h-4 w-4" />}
            label={t("মোট ডিস্ক ব্যবহার", "Total disk used")}
            value={formatBytes(stats.totalBytes)}
            tone="default"
          />
        </div>
      )}

      {/* Postgres Tools health card — proactively surfaces whether the
          server can run pg_dump/pg_restore, BEFORE the admin clicks
          "Backup now". The hint string is the exact one the backend
          returns from `assertPgToolsAvailable`, so this card and the
          503 toast on a failed click can never disagree about what
          command to run. Polled every 60s so admins see the card flip
          to green after they install postgresql-client + restart. */}
      <ToolsHealthCard
        health={toolsHealth}
        t={t}
        onCopy={(cmd) => {
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(cmd).catch(() => {});
          }
        }}
      />

      {/* Settings card */}
      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle>{t("ব্যাকআপ সময়সূচী", "Backup schedule")}</CardTitle>
            <CardDescription>
              {t(
                "OS ক্রন প্রতিদিন ০৩:০০ এ চলে। এখানে অটো-প্রুন এবং রিটেনশন কনফিগার করুন।",
                "OS cron runs daily at 03:00. Configure auto-prune and retention here.",
              )}
            </CardDescription>
          </div>
          <Button
            onClick={() => saveSettings.mutate(form)}
            disabled={saveSettings.isPending || settingsLoading}
          >
            {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveSettings.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("রিটেনশন (দিন)", "Retention (days)")}
            </label>
            <Input
              type="number"
              min={1}
              max={365}
              step={1}
              value={form.retentionDays}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  retentionDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                }))
              }
              className="max-w-[160px]"
            />
            <p className="text-xs text-ink-500">
              {t("এই দিনের চেয়ে পুরনো সফল ব্যাকআপ অটো-মুছে যাবে।", "Backups older than this auto-delete.")}
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 self-end">
            <input
              type="checkbox"
              checked={form.scheduledEnabled}
              onChange={(e) => setForm((s) => ({ ...s, scheduledEnabled: e.target.checked }))}
              className="mt-1 h-5 w-5 rounded border-ink-300 text-primary-700"
            />
            <div>
              <div className="text-sm font-medium text-ink-900 dark:text-ink-900">
                {t("শিডিউল্ড ব্যাকআপ সক্রিয়", "Scheduled backups enabled")}
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                {t(
                  "অ্যাপ ফ্ল্যাগ। সম্পূর্ণ বন্ধ করতে sudo crontab -e দিয়ে ক্রন এন্ট্রি মুছুন।",
                  "App flag. To fully disable, remove the cron entry via sudo crontab -e.",
                )}
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={t("সব", "All")}
          active={statusFilter === "" && modeFilter === ""}
          onClick={() => {
            setStatusFilter("");
            setModeFilter("");
            setPage(1);
          }}
        />
        <FilterChip
          label={t("সফল", "Success")}
          active={statusFilter === "SUCCESS"}
          onClick={() => {
            setStatusFilter(statusFilter === "SUCCESS" ? "" : "SUCCESS");
            setPage(1);
          }}
        />
        <FilterChip
          label={t("ব্যর্থ", "Failed")}
          active={statusFilter === "FAILED"}
          onClick={() => {
            setStatusFilter(statusFilter === "FAILED" ? "" : "FAILED");
            setPage(1);
          }}
        />
        <FilterChip
          label={t("ম্যানুয়াল", "Manual")}
          active={modeFilter === "MANUAL"}
          onClick={() => {
            setModeFilter(modeFilter === "MANUAL" ? "" : "MANUAL");
            setPage(1);
          }}
        />
        <FilterChip
          label={t("শিডিউল্ড", "Scheduled")}
          active={modeFilter === "SCHEDULED"}
          onClick={() => {
            setModeFilter(modeFilter === "SCHEDULED" ? "" : "SCHEDULED");
            setPage(1);
          }}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <Database className="h-10 w-10 text-ink-300" />
              <p className="text-sm text-ink-500">
                {t(
                  "কোনো ব্যাকআপ নেই — 'ব্যাকআপ নাও' বোতাম চাপুন অথবা 'স্ক্যান ডিস্ক' দিয়ে আগের ফাইল ইম্পোর্ট করুন।",
                  "No backups yet — click 'Backup now' or 'Scan disk' to import existing files.",
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500 dark:bg-ink-100">
                  <tr>
                    <th className="px-4 py-2">{t("ফাইল", "File")}</th>
                    <th className="px-4 py-2">{t("আকার", "Size")}</th>
                    <th className="px-4 py-2">{t("মোড", "Mode")}</th>
                    <th className="px-4 py-2">{t("ট্রিগার", "Trigger")}</th>
                    <th className="px-4 py-2">{t("অবস্থা", "Status")}</th>
                    <th className="px-4 py-2">{t("শুরু", "Started")}</th>
                    <th className="px-4 py-2">{t("সময়", "Duration")}</th>
                    <th className="px-4 py-2 text-right">{t("অ্যাকশন", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b: BackupRow) => (
                    <tr
                      key={b.id}
                      className="border-t border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100"
                    >
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs text-ink-900 dark:text-ink-900">{b.fileName}</div>
                        {b.notes && (
                          <div className="mt-0.5 text-[11px] text-ink-500">{b.notes}</div>
                        )}
                        {b.error && (
                          <div className="mt-0.5 text-[11px] text-danger-600">{b.error.slice(0, 80)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-ink-700 dark:text-ink-900">
                        {formatBytes(b.sizeBytes)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge kind={b.mode === "MANUAL" ? "blue" : "gray"}>
                          {b.mode === "MANUAL" ? t("ম্যানুয়াল", "Manual") : t("শিডিউল্ড", "Scheduled")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge kind={b.trigger === "USER" ? "blue" : b.trigger === "CRON" ? "gray" : "amber"}>
                          {b.trigger}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={b.status} t={t} />
                      </td>
                      <td className="px-4 py-2 text-ink-700 dark:text-ink-900">
                        {new Date(b.startedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-ink-700 dark:text-ink-900">
                        {b.durationMs != null ? `${(b.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn
                            label={t("ডাউনলোড", "Download")}
                            onClick={() => download(b.id, b.fileName)}
                            disabled={b.status !== "SUCCESS"}
                            icon={<Download className="h-3.5 w-3.5" />}
                          />
                          <IconBtn
                            label={t("রিস্টোর", "Restore")}
                            onClick={() => setRestoreTarget(b)}
                            disabled={b.status !== "SUCCESS"}
                            icon={<RotateCcw className="h-3.5 w-3.5" />}
                            variant="danger"
                          />
                          <IconBtn
                            label={t("মুছুন", "Delete")}
                            onClick={() => {
                              if (confirm(t(`মুছে ফেলবেন ${b.fileName}?`, `Delete ${b.fileName}?`))) {
                                remove.mutate(b.id);
                              }
                            }}
                            disabled={remove.isPending}
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            variant="danger"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DataTablePagination
            page={page}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </CardContent>
      </Card>

      <RestoreModal
        backup={restoreTarget}
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["admin", "system", "backups"] })}
      />
    </div>
  );
}

// ─── Small UI helpers ─────────────────────────────────────────

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success-700"
      : tone === "danger"
      ? "text-danger-600"
      : "text-ink-900 dark:text-ink-900";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
          {icon}
        </div>
        <div>
          <div className="text-xs text-ink-500">{label}</div>
          <div className={`text-lg font-bold ${toneClass}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Badge({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: "blue" | "gray" | "amber";
}) {
  const cls =
    kind === "blue"
      ? "bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100"
      : kind === "amber"
      ? "bg-warning-100 text-warning-700 dark:bg-warning-200 dark:text-warning-900"
      : "bg-ink-100 text-ink-700 dark:bg-ink-200 dark:text-ink-900";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {children}
    </span>
  );
}

/**
 * Persistent banner shown whenever any backup row is RUNNING. Re-ticks
 * every 1s to update the elapsed-time counter. Disappears automatically
 * when the row's status flips back to SUCCESS / FAILED (parent re-renders
 * with `row = null`).
 */
function RunningBanner({
  row,
  t,
}: {
  row: BackupRow | null;
  t: (bn: string, en: string) => string;
}) {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!row) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [row]);

  if (!row) return null;

  const startedMs = new Date(row.startedAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - startedMs) / 1000));
  const mm = Math.floor(elapsedSec / 60);
  const ss = elapsedSec % 60;
  const elapsed = mm > 0 ? `${mm}m ${ss.toString().padStart(2, "0")}s` : `${ss}s`;

  const trigger =
    row.trigger === "USER"
      ? t("অ্যাডমিন দ্বারা", "by admin")
      : row.trigger === "CRON"
      ? t("ক্রন দ্বারা", "by cron")
      : t("সিস্টেম দ্বারা", "by system");

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm dark:border-primary-800 dark:bg-primary-900/30"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary-700 dark:text-primary-200" />
        <div className="min-w-0">
          <div className="font-medium text-primary-900 dark:text-primary-100">
            {t("ব্যাকআপ চলছে", "Backup in progress")}{" "}
            <span className="font-mono text-xs text-primary-700 dark:text-primary-200">
              ({elapsed})
            </span>
          </div>
          <div className="truncate text-xs text-primary-700 dark:text-primary-200">
            <span className="font-mono">{row.fileName}</span> · {trigger}
          </div>
        </div>
      </div>
      <div className="shrink-0 text-xs text-primary-700 dark:text-primary-200">
        {t("অটো-রিফ্রেশ: ৩ সেকেন্ড", "Auto-refresh: 3s")}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: "RUNNING" | "SUCCESS" | "FAILED";
  t: (bn: string, en: string) => string;
}) {
  if (status === "RUNNING") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-700 dark:bg-primary-800 dark:text-primary-100">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("চলছে", "Running")}
      </span>
    );
  }
  if (status === "SUCCESS") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-success-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-success-700">
        <CheckCircle2 className="h-3 w-3" />
        {t("সফল", "Success")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-danger-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger-700">
      <AlertTriangle className="h-3 w-3" />
      {t("ব্যর্থ", "Failed")}
    </span>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary-700 bg-primary-700 text-white"
          : "border-ink-200 bg-white text-ink-700 hover:border-primary-400 dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
      }`}
    >
      {label}
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  icon,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  variant?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors ${
        variant === "danger"
          ? "border-danger-200 text-danger-600 hover:bg-danger-50 disabled:opacity-40"
          : "border-ink-200 text-ink-600 hover:bg-ink-100 disabled:opacity-40 dark:border-ink-300 dark:text-ink-700 dark:hover:bg-ink-200"
      }`}
    >
      {icon}
    </button>
  );
}

function formatBytes(b: string | number): string {
  const n = typeof b === "string" ? Number(b) : b;
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Build the same API base the centralized client uses, so the download
 * fetch carries the audience JWT the same way the JSON calls do.
 */
function resolveApiBase(): string {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
    "http://localhost:3001";
  return raw.replace(/\/api\/v\d+\/?$/, "") + "/api/v1";
}

function getAccessToken(): string {
  try {
    const raw = localStorage.getItem("xm-auth");
    if (!raw) return "";
    return (JSON.parse(raw).accessToken as string) ?? "";
  } catch {
    return "";
  }
}

/**
 * Postgres Tools status card — surfaces whether `pg_dump` and
 * `pg_restore` are reachable on the API server's PATH so admins see
 * the problem before clicking "Backup now".
 *
 * The `health.installHint` string is the exact text the backend's
 * `assertPgToolsAvailable` would have thrown — so what you see on this
 * card and the 503 error toast on a failed click can never disagree.
 *
 * States:
 *   - ok=true         → green checkmark, "OK" (informational, still
 *                       shows which binaries are installed)
 *   - ok=false        → red cross + missing list + the OS-appropriate
 *                       install command (copyable, one click)
 *   - health=undefined → skeleton pulse while the query is loading
 */
function ToolsHealthCard({
  health,
  t,
  onCopy,
}: {
  health:
    | {
        pgDump: boolean;
        pgRestore: boolean;
        ok: boolean;
        missing: string[];
        platform: string;
        installHint: string;
      }
    | undefined;
  t: (bn: string, en: string) => string;
  onCopy: (text: string) => void;
}) {
  if (!health) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
          <span className="text-sm text-ink-500">
            {t("পোস্টগ্রেস টুলস যাচাই হচ্ছে...", "Checking Postgres tools...")}
          </span>
        </CardContent>
      </Card>
    );
  }

  const isWin = health.platform === "win32";
  const platformLabel =
    health.platform === "win32"
      ? t("উইন্ডোজ", "Windows")
      : health.platform === "darwin"
      ? t("ম্যাকওএস", "macOS")
      : t("লিনাক্স", "Linux");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded ${
            health.ok
              ? "bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-100"
              : "bg-danger-100 text-danger-700 dark:bg-danger-700/30 dark:text-danger-100"
          }`}
        >
          {health.ok ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1">
          <CardTitle className="flex items-center gap-2">
            {t("পোস্টগ্রেস ক্লায়েন্ট টুলস", "Postgres client tools")}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                health.ok
                  ? "bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-100"
                  : "bg-danger-100 text-danger-700 dark:bg-danger-700/30 dark:text-danger-100"
              }`}
            >
              {health.ok ? t("ঠিক আছে", "OK") : t("অনুপস্থিত", "MISSING")}
            </span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] text-ink-600 dark:bg-ink-200 dark:text-ink-900">
              {platformLabel}
            </span>
          </CardTitle>
          <CardDescription>
            {health.ok
              ? t(
                  "pg_dump এবং pg_restore দুটোই PATH-তে আছে — ব্যাকআপ চালানো যাবে।",
                  "Both pg_dump and pg_restore are on PATH — backups can run.",
                )
              : t(
                  `নিম্নলিখিত বাইনারি অনুপস্থিত: ${health.missing.join(
                    ", ",
                  )}। ব্যাকআপ শুরু করার আগে ইনস্টল করুন।`,
                  `Missing binaries: ${health.missing.join(
                    ", ",
                  )}. Install them before running a backup.`,
                )}
          </CardDescription>
        </div>
      </CardHeader>
      {!health.ok && health.installHint && (
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 shrink-0 text-ink-500" />
              <span className="text-xs font-semibold uppercase text-ink-500">
                {t("ইনস্টল কমান্ড", "Install command")}
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-ink-200 bg-ink-50 p-3 font-mono text-xs text-ink-900 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900">
              <code className="flex-1 break-all whitespace-pre-wrap">
                {/* Split installHint at `.` to highlight the first sentence
                    (the install command) separately from any trailing
                    instructions (e.g. "then restart the API"). On Linux
                    /macOS the message is single-sentence, so the array
                    has one element and we just render that. */}
                {(() => {
                  const firstSentence = health.installHint.split(". ")[0];
                  const rest = health.installHint.slice(firstSentence.length);
                  return (
                    <>
                      <span className="font-semibold">{firstSentence}.</span>
                      {rest && (
                        <span className="text-ink-600 dark:text-ink-700">
                          {" "}
                          {rest}
                        </span>
                      )}
                    </>
                  );
                })()}
              </code>
              <button
                type="button"
                onClick={() => onCopy(health.installHint)}
                className="ml-2 inline-flex shrink-0 items-center gap-1 rounded border border-ink-200 bg-white px-2 py-1 text-[10px] font-medium text-ink-700 hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
                aria-label={t(
                  "ইনস্টল কমান্ড কপি করুন",
                  "Copy install command",
                )}
                title={t("ক্লিপবোর্ডে কপি করুন", "Copy to clipboard")}
              >
                <Copy className="h-3 w-3" />
                {t("কপি", "Copy")}
              </button>
            </div>
            {isWin && (
              <p className="text-xs text-ink-500">
                {t(
                  "উইন্ডোজে: EDB ইনস্টলার ব্যবহার করুন অথবা C:\\Program Files\\PostgreSQL\\<version>\\bin PATH-এ যোগ করুন এবং API রিস্টার্ট করুন।",
                  "On Windows: use the EDB installer or add C:\\Program Files\\PostgreSQL\\<version>\\bin to PATH, then restart the API.",
                )}
              </p>
            )}
            {!isWin && (
              <p className="text-xs text-ink-500">
                {t(
                  "ডেবিয়ান/উবুন্টু: apt install postgresql-client · Homebrew: brew install libpq · অ্যালপাইন: apk add postgresql-client",
                  "Debian/Ubuntu: apt install postgresql-client · Homebrew: brew install libpq · Alpine: apk add postgresql-client",
                )}
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}