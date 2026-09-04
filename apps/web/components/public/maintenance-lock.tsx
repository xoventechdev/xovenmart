"use client";

import { useEffect } from "react";
import { Wrench, Clock, Calendar, AlertTriangle } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useMaintenance } from "@/lib/use-maintenance";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { BrandLockup } from "@/components/brand-lockup";

/**
 * Full-screen "site is under maintenance" lock.
 *
 * Replaces the previous `<MaintenanceBanner />` yellow strip. Now that
 * the toggle has a single source of truth (`/admin/system/maintenance`),
 * we can show the public site what the dedicated page UI *promised*:
 * a hard lock page that customers can't accidentally bypass, while
 * `/admin/*` stays open so the on-call admin can flip it back off in
 * one click.
 *
 * Returns `null` while the public maintenance endpoint is loading so
 * the public site doesn't flash the normal page for half a second —
 * keeps SEO crawlers and unauthenticated visitors from rendering
 * anything stale.
 *
 * The component sets a short `Cache-Control: no-store` meta hint on
 * the page so browsers don't cache the lock HTML for an admin who
 * later navigates back during the maintenance window.
 */
export function MaintenanceLock() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { enabled, isLoading, message, startsAt, endsAt } = useMaintenance();
  const general = useGeneralSettingsSafe();

  // While we're deciding whether to show the lock, render nothing.
  // Refusing to render the regular page header / footer / nav means we
  // never serve a flash of catalogue UI to a visitor who is supposed
  // to see the lock.
  if (isLoading || !enabled) return null;

  // Best-effort hint to browsers / CDNs that this page should not be
  // cached as a normal response. Coolify's Traefik sits in front of
  // Next.js so the headers still bubble up.
  useEffect(() => {
    if (typeof document === "undefined") return;
    // Replace any prior "robots" hint with the maintenance-aware one.
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="x-maintenance-lock"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "x-maintenance-lock");
      meta.setAttribute("content", "on");
      document.head.appendChild(meta);
    }
    return () => {
      meta?.remove();
    };
  }, []);

  const brandName =
    lang === "en"
      ? general.store.nameEn || "XovenMart"
      : general.store.nameBn || "জোভেনমার্ট";

  // Format the schedule in the visitor's locale. We render ISO strings
  // already (admin wrote them server-side via the maintenance page
  // datetime-local input → ISO). Defensive: if the admin entered
  // garbage, just hide the line.
  const fmt = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    } catch {
      return d.toISOString();
    }
  };
  const startsLabel = fmt(startsAt);
  const endsLabel = fmt(endsAt);

  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-primary-50 px-4 py-10 dark:bg-ink-900">
      <div className="w-full max-w-lg text-center">
        {/* Brand mark — uses admin-uploaded logos in light / dark mode,
            falls back to the inline SVG BrandMark. Sized up to 96 px so
            it has presence on the lock screen. */}
        <div className="mx-auto mb-8 inline-flex shadow-lg rounded-2xl overflow-hidden">
          <BrandLockup
            size={96}
            logoUrl={general.brand.logoUrl}
            logoDarkUrl={general.brand.logoDarkUrl}
          />
        </div>

        {/* Icon halo */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100">
          <Wrench className="h-10 w-10" />
        </div>

        {/* Title — bilingual; admin `brandTagline*` not relevant here. */}
        <h1 className="text-3xl font-bold text-ink-900 dark:text-ink-50 sm:text-4xl">
          {t("আমরা সাময়িকভাবে রক্ষণাবেক্ষণে আছি", "We're under maintenance")}
        </h1>
        <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
          {t(
            `${brandName} এ ফিরে আসা হচ্ছে`,
            `We'll be back on ${brandName} shortly`,
          )}
        </p>

        {/* Admin's message box — only when they wrote something. */}
        {message?.trim() && (
          <div className="mt-8 rounded-lg border border-ink-200 bg-white p-4 text-left text-sm text-ink-700 shadow-sm dark:border-ink-300 dark:bg-ink-800 dark:text-ink-100">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning-700 dark:text-warning-100">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("বিজ্ঞপ্তি", "Notice")}
            </div>
            <p className="whitespace-pre-line">{message}</p>
          </div>
        )}

        {/* Schedule — only when the admin provided at least one bound. */}
        {(startsLabel || endsLabel) && (
          <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
            {startsLabel && (
              <div className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-300 dark:bg-ink-800">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("শুরু", "Starts")}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-900 dark:text-ink-50">
                  {startsLabel}
                </div>
              </div>
            )}
            {endsLabel && (
              <div className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-300 dark:bg-ink-800">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                  <Clock className="h-3.5 w-3.5" />
                  {t("শেষ", "Ends")}
                </div>
                <div className="mt-1 text-sm font-medium text-ink-900 dark:text-ink-50">
                  {endsLabel}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-10 text-xs text-ink-500 dark:text-ink-400">
          {t(
            "এই বার্তাটি অ্যাডমিনের রক্ষণাবেক্ষণ পেজ থেকে স্বয়ংক্রিয়ভাবে তৈরি হয়েছে।",
            "This page is automatically generated from the admin's Maintenance settings.",
          )}
        </p>
      </div>
    </div>
  );
}
