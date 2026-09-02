"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { extractApiMessage } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { toast } from "sonner";

interface BackupRow {
  id: string;
  fileName: string;
  sizeBytes: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
}

interface PreviewResponse {
  backupId: string;
  preview: string;
  safetyBackupId: string | null;
  fileName: string;
  sizeBytes: string;
}

interface ExecuteResponse {
  ok: boolean;
  safetyBackupId: string;
  safetyFileName: string;
  restoredFrom: string;
  durationMs: number;
}

interface RestoreModalProps {
  backup: BackupRow | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Two-step restore modal:
 *   Step 1 — preview: hits `POST /backups/:id/restore` and shows the
 *     first ~200 lines of `pg_restore --list`. No DB writes.
 *   Step 2 — confirm: admin types the literal word `RESTORE`. Button
 *     stays disabled until the text matches. Submit hits
 *     `POST /backups/:id/restore/execute`. A safety dump is taken of
 *     the CURRENT DB first; if it fails, the restore aborts.
 *
 * The safety-backup id is returned in the success toast so the admin
 * knows which file to restore if the new restore turns out wrong.
 */
export function RestoreModal({ backup, open, onClose, onSuccess }: RestoreModalProps) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [step, setStep] = useState<"preview" | "confirm">("preview");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Reset state every time the modal opens
  useEffect(() => {
    if (!open || !backup) return;
    setStep("preview");
    setPreview(null);
    setConfirmText("");
    setLoading(true);
    setExecuting(false);
    api
      .post<PreviewResponse>(`/admin/system/backups/${backup.id}/restore`)
      .then(setPreview)
      .catch((e) => {
        toast.error(extractApiMessage(e, "Preview failed"));
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, backup, onClose]);

  if (!open || !backup) return null;

  const canConfirm = confirmText === "RESTORE" && !executing;

  async function execute() {
    if (!backup || !canConfirm) return;
    setExecuting(true);
    try {
      const result = await api.post<ExecuteResponse>(
        `/admin/system/backups/${backup.id}/restore/execute`,
        { confirm: confirmText, notes: undefined },
      );
      toast.success(
        t(
          `রিস্টোর সফল। সেফটি ব্যাকআপ: ${result.safetyFileName}`,
          `Restore complete. Safety backup: ${result.safetyFileName}`,
        ),
      );
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(extractApiMessage(e, "Restore failed"));
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900 dark:text-ink-900">
            <RotateCcw className="h-5 w-5 text-danger-500" />
            {t("রিস্টোর ডাটাবেস", "Restore Database")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {/* Warning banner */}
          <div className="mb-4 flex gap-3 rounded-md border border-danger-200 bg-danger-50 p-3 dark:border-danger-300 dark:bg-danger-100/50">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" />
            <div className="text-sm text-danger-900 dark:text-danger-700">
              <p className="font-semibold">
                {t("সতর্কতা: এই অপারেশন ডেস্ট্রাক্টিভ।", "Warning: this operation is destructive.")}
              </p>
              <p className="mt-1">
                {t(
                  "রিস্টোর করলে বর্তমান ডাটাবেস প্রতিস্থাপিত হবে। প্রথমে একটি সেফটি ব্যাকআপ নেওয়া হবে, তারপরে pg_restore চলবে।",
                  "Restoring will replace the current database. A safety backup will be taken first, then pg_restore will run.",
                )}
              </p>
            </div>
          </div>

          {/* Backup summary */}
          <div className="mb-4 rounded-md bg-ink-100 px-4 py-3 text-sm dark:bg-ink-200">
            <div className="flex justify-between gap-4">
              <span className="text-ink-500">{t("ফাইল", "File")}</span>
              <code className="font-mono text-xs text-ink-900 dark:text-ink-900">{backup.fileName}</code>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-ink-500">{t("আকার", "Size")}</span>
              <span className="text-ink-900 dark:text-ink-900">{formatBytes(backup.sizeBytes)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-ink-500">{t("শুরু", "Started")}</span>
              <span className="text-ink-900 dark:text-ink-900">
                {new Date(backup.startedAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Step 1: Preview */}
          {step === "preview" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-900">
                {t("ধাপ ১: ড্রাই-রান প্রিভিউ", "Step 1: Dry-run preview")}
              </h3>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-ink-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("লোড হচ্ছে...", "Loading...")}
                </div>
              ) : (
                <pre className="max-h-72 overflow-auto rounded bg-ink-900 p-3 font-mono text-xs text-ink-50">
                  {preview?.preview ?? ""}
                </pre>
              )}
              <p className="mt-2 text-xs text-ink-500">
                {t(
                  "উপরের তালিকা হলো pg_restore যা চালাবে তার প্রথম ২০০ লাইন।",
                  "Above is the first 200 lines of what pg_restore would execute.",
                )}
              </p>
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === "confirm" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-900">
                {t("ধাপ ২: নিশ্চিত করুন", "Step 2: Confirm")}
              </h3>
              <p className="text-sm text-ink-700 dark:text-ink-900">
                {t(
                  `কন্টিনিউ করতে নিচের বাক্সে হুবহু "${"RESTORE"}" টাইপ করুন (কেস-সেনসিটিভ)।`,
                  `Type exactly "${"RESTORE"}" below to continue (case-sensitive).`,
                )}
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm text-ink-900 focus:border-danger-400 focus:outline-none dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <p className="text-xs text-ink-500">
                {t(
                  "রিস্টোর ১০-৬০ সেকেন্ড সময় নিতে পারে। সেফটি ব্যাকআপ আইডি টোস্টে দেখানো হবে।",
                  "Restore may take 10-60 seconds. The safety backup id will be shown in the toast.",
                )}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3 dark:border-ink-300 dark:bg-ink-100">
          <Button variant="outline" onClick={onClose} disabled={executing}>
            {t("বাতিল", "Cancel")}
          </Button>
          {step === "preview" ? (
            <Button
              onClick={() => setStep("confirm")}
              disabled={loading || !preview}
              variant="destructive"
            >
              {t("পরবর্তী →", "Next →")}
            </Button>
          ) : (
            <Button onClick={execute} disabled={!canConfirm} variant="destructive">
              {executing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("রিস্টোর হচ্ছে...", "Restoring...")}
                </>
              ) : (
                t("রিস্টোর চালান", "Run restore")
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
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
