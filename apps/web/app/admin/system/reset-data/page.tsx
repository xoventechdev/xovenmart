"use client";

/**
 * Admin "Reset demo data" page.
 *
 * Destructive one-shot wipe of all products, categories, and orders.
 * Intended for operators moving the site from demo data to real data.
 *
 * Flow:
 *   1. On load → fetch `/admin/system/data-reset/preview` and render
 *      the current row counts in a card so the admin sees exactly how
 *      much data would be removed.
 *   2. Admin must type `WIPE DEMO DATA` (literal, case-sensitive) into
 *      a confirmation input. The Wipe button stays disabled until the
 *      typed string matches.
 *   3. Click Wipe → POST `/admin/system/data-reset` with `{ confirm }`.
 *      The backend takes an automatic pg_dump FIRST; if it fails the
 *      backend refuses to touch the data and we surface that as a
 *      toast (with the install hint if pg tools are missing).
 *   4. On success we render a result card with the auto-backup id +
 *      filename so the admin can find it on `/admin/system/backups`
 *      and restore if the wipe turns out to be wrong.
 *
 * Access:
 *   - ADMIN only. The backend rejects MANAGER with @AdminOnly(), and
 *     the sidebar nav already hides this entry from MANAGER role.
 *   - We additionally double-check the role client-side and show a
 *     "Restricted" card if a manager navigates here directly.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api, extractApiMessage } from "@/lib/api";
import { toast } from "sonner";

const CONFIRM_PHRASE = "WIPE DEMO DATA";

interface ResetCounts {
  orders: number;
  orderItems: number;
  payments: number;
  deliveries: number;
  statusEvents: number;
  products: number;
  productImages: number;
  inventory: number;
  stockMovements: number;
  categories: number;
}

interface ResetResult extends ResetCounts {
  backupId: string;
  backupFileName: string;
}

function readAuthRole(): "ADMIN" | "MANAGER" | "RIDER" | "CUSTOMER" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("xm-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const role = (parsed?.role ?? parsed?.user?.role ?? parsed?.admin?.role) as
      | string
      | undefined;
    if (!role) return null;
    const upper = role.toUpperCase();
    if (upper === "ADMIN") return "ADMIN";
    if (upper === "MANAGER") return "MANAGER";
    if (upper === "RIDER") return "RIDER";
    return "CUSTOMER";
  } catch {
    return null;
  }
}

export default function ResetDataPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "RIDER" | "CUSTOMER" | null>(null);
  useEffect(() => {
    setRole(readAuthRole());
  }, []);

  const [confirmText, setConfirmText] = useState("");
  const isConfirmValid = confirmText === CONFIRM_PHRASE;

  // Preview the row counts that WOULD be deleted. Cheap (10 count
  // queries) so we just refetch every time the page mounts — no need
  // for fancy invalidation. The query is skipped if the role isn't
  // ADMIN so a manager who somehow lands here doesn't trigger a 403
  // storm.
  const preview = useQuery({
    queryKey: ["admin", "system", "data-reset", "preview"],
    queryFn: () => api.get("/admin/system/data-reset/preview") as Promise<ResetCounts>,
    enabled: role === "ADMIN",
    refetchOnWindowFocus: false,
  });

  const wipe = useMutation({
    mutationFn: () =>
      api.post("/admin/system/data-reset", { confirm: CONFIRM_PHRASE }) as Promise<ResetResult>,
    onSuccess: (res) => {
      toast.success(
        t(
          "ডেমো ডেটা মুছে ফেলা হয়েছে",
          "Demo data wiped",
        ),
        {
          description: t(
            `ব্যাকআপ আইডি: ${res.backupId} · ${res.backupFileName}`,
            `Backup id: ${res.backupId} · ${res.backupFileName}`,
          ),
          duration: 12000,
        },
      );
      // Re-fetch the preview so the count card collapses to zeros.
      qc.invalidateQueries({ queryKey: ["admin", "system", "data-reset", "preview"] });
      // Also bust the sidebar dashboard / product counts so other
      // tabs reflect the new state immediately.
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      setConfirmText("");
    },
    onError: (e) => {
      const msg = extractApiMessage(e, t("ডেটা মুছতে ব্যর্থ", "Wipe failed"));
      const code = (e as any)?.data?.errorCode as string | undefined;
      if (code === "pg_tools_missing") {
        toast.error(msg, {
          description: t(
            "সার্ভারে পোস্টগ্রেস CLI টুলস নেই। ব্যাকআপ ব্যর্থ হওয়ায় কোনো ডেটা মুছে ফেলা হয়নি।",
            "Postgres client tools are missing on the server. No data was deleted because the safety backup failed.",
          ),
          duration: 15000,
        });
        return;
      }
      toast.error(msg, { duration: 8000 });
    },
  });

  const totalAffected = useMemo(() => {
    const c = preview.data;
    if (!c) return 0;
    return (
      c.orders +
      c.orderItems +
      c.payments +
      c.deliveries +
      c.statusEvents +
      c.products +
      c.productImages +
      c.inventory +
      c.stockMovements +
      c.categories
    );
  }, [preview.data]);

  // ─── Role gate ────────────────────────────────────────────────
  if (role === null) {
    // localStorage not yet read (effect hasn't fired on first paint).
    // Render a neutral loader; the role check fires in the next tick.
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("লোড হচ্ছে...", "Loading...")}
      </div>
    );
  }

  if (role !== "ADMIN") {
    return (
      <Card className="border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-red-900 dark:text-red-100">
              {t("অ্যাক্সেস সীমাবদ্ধ", "Restricted")}
            </CardTitle>
            <CardDescription className="text-red-700 dark:text-red-300">
              {t(
                "শুধুমাত্র অ্যাডমিন ভূমিকা এই পেজটি দেখতে পারে।",
                "Only the ADMIN role can access this page.",
              )}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  // ─── Main render ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("ডেমো ডেটা রিসেট", "Reset demo data")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "সব পণ্য, ক্যাটাগরি ও অর্ডার মুছে ফেলুন — ব্যাকআপ আগে নেওয়া হবে।",
              "Wipe all products, categories, and orders — a backup is taken first.",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => preview.refetch()}
          disabled={preview.isFetching}
        >
          {preview.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {preview.isFetching ? t("রিফ্রেশ হচ্ছে...", "Refreshing...") : t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      {/* Danger banner — always visible. Reinforces that this is a
          destructive action and reminds the admin the safety backup
          runs first. */}
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-amber-900 dark:text-amber-100">
              {t("সতর্কতা: ধ্বংসাত্মক অপারেশন", "Warning: destructive operation")}
            </CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200">
              {t(
                "এই অ্যাকশনে সব পণ্য, ক্যাটেগরি এবং অর্ডার মুছে যাবে। সার্ভারে স্বয়ংক্রিয় ব্যাকআপ নেওয়া হবে — ব্যাকআপ ব্যর্থ হলে কিছুই মুছে ফেলা হবে না।",
                "This will delete every product, category, and order. A safety backup is taken automatically first — if the backup fails, no data is touched.",
              )}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {/* What gets wiped — itemised count card */}
      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <HardDrive className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle>
              {t("কী মুছে যাবে", "What will be wiped")}
            </CardTitle>
            <CardDescription>
              {t(
                `মোট ${totalAffected.toLocaleString()}টি সারি প্রভাবিত হবে।`,
                `${totalAffected.toLocaleString()} total rows would be affected.`,
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {preview.isLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-ink-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("গণনা হচ্ছে...", "Counting rows...")}
            </div>
          ) : preview.isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {extractApiMessage(preview.error, t("কাউন্ট লোড ব্যর্থ", "Failed to load counts"))}
            </div>
          ) : preview.data ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
              <CountStat
                label={t("অর্ডার", "Orders")}
                value={preview.data.orders}
              />
              <CountStat
                label={t("অর্ডার আইটেম", "Order items")}
                value={preview.data.orderItems}
              />
              <CountStat
                label={t("পেমেন্ট", "Payments")}
                value={preview.data.payments}
              />
              <CountStat
                label={t("ডেলিভারি", "Deliveries")}
                value={preview.data.deliveries}
              />
              <CountStat
                label={t("স্ট্যাটাস ইভেন্ট", "Status events")}
                value={preview.data.statusEvents}
              />
              <CountStat
                label={t("পণ্য", "Products")}
                value={preview.data.products}
              />
              <CountStat
                label={t("পণ্য ছবি", "Product images")}
                value={preview.data.productImages}
              />
              <CountStat
                label={t("ইনভেন্টরি", "Inventory")}
                value={preview.data.inventory}
              />
              <CountStat
                label={t("স্টক মুভমেন্ট", "Stock movements")}
                value={preview.data.stockMovements}
              />
              <CountStat
                label={t("ক্যাটাগরি", "Categories")}
                value={preview.data.categories}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Confirmation + Wipe button. Disabled until the admin types the
          exact phrase. Mirrors the typed-confirmation pattern from the
          /admin/system/backups restore flow so muscle memory transfers. */}
      <Card className="border-red-300">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">
            <Trash2 className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-red-900 dark:text-red-100">
              {t("ডেটা মুছে ফেলুন", "Execute wipe")}
            </CardTitle>
            <CardDescription>
              {t(
                `নিচের বাক্সে হুবহু "${CONFIRM_PHRASE}" লিখুন। ক্যাপিটাল ও স্পেস গুরুত্বপূর্ণ।`,
                `Type "${CONFIRM_PHRASE}" exactly below. Case and spaces matter.`,
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="font-mono tracking-wider"
              disabled={wipe.isPending}
            />
            <p className="text-xs text-ink-500">
              {isConfirmValid
                ? t("কনফার্মেশন মিলেছে — মুছে ফেলা সক্রিয়।", "Confirmation matches — wipe is enabled.")
                : t(
                    `বাক্সে ঠিক "${CONFIRM_PHRASE}" লিখলে বোতাম সক্রিয় হবে।`,
                    `Type exactly "${CONFIRM_PHRASE}" to enable the button.`,
                  )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={() => wipe.mutate()}
              disabled={!isConfirmValid || wipe.isPending}
            >
              {wipe.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              {wipe.isPending
                ? t("মুছে ফেলা হচ্ছে...", "Wiping...")
                : t("সব ডেমো ডেটা মুছে ফেলুন", "Wipe all demo data")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmText("")}
              disabled={wipe.isPending || !confirmText}
            >
              {t("ক্লিয়ার", "Clear")}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/system/backups">{t("ব্যাকআপ দেখুন", "View backups")}</Link>
            </Button>
          </div>

          <p className="text-xs text-ink-500">
            {t(
              "ব্যাকআপ ব্যর্থ হলে কিছুই মুছে ফেলা হবে না এবং একটি ত্রুটি দেখানো হবে।",
              "If the backup fails, nothing will be wiped and an error will be shown.",
            )}
          </p>
        </CardContent>
      </Card>

      {/* After-wipe help — link back to the backup list so the admin
          can immediately download the just-taken dump. */}
      {wipe.data && (
        <Card className="border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
              <Database className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-green-900 dark:text-green-100">
                {t("মুছে ফেলা সম্পন্ন", "Wipe complete")}
              </CardTitle>
              <CardDescription className="text-green-800 dark:text-green-200">
                {t(
                  "রিস্টোর করতে হলে ব্যাকআপ পেজ থেকে ডাম্পটি ডাউনলোড করুন।",
                  "To restore, download the dump from the Backups page.",
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">{t("ব্যাকআপ আইডি", "Backup id")}: </span>
              <code className="rounded bg-ink-100 px-1 py-0.5 text-xs dark:bg-ink-800">
                {wipe.data.backupId}
              </code>
            </p>
            <p>
              <span className="font-medium">{t("ফাইল", "File")}: </span>
              <code className="rounded bg-ink-100 px-1 py-0.5 text-xs dark:bg-ink-800">
                {wipe.data.backupFileName}
              </code>
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" asChild>
                <Link href="/admin/system/backups">
                  {t("ব্যাকআপ পেজে যান", "Open backups page")}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/products/new">{t("নতুন পণ্য যোগ করুন", "Add a product")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CountStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800/50">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900 dark:text-ink-50">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
