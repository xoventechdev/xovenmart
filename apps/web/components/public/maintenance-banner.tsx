"use client";

import { AlertTriangle } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useFeatureToggles } from "@/lib/use-feature-toggles";

/**
 * Top-of-page yellow banner shown on every public page when the admin
 * has enabled `maintenanceMode`. Keeps the site browsable but signals
 * to users that orders/experience may be degraded.
 *
 * Mounted inside `(public)/layout.tsx` so it appears on every public
 * route without each page needing to import it. Hidden until the
 * feature-toggle query resolves so a slow API never blocks the rest of
 * the page from painting.
 */
export function MaintenanceBanner() {
  const { lang } = useTheme();
  const { maintenanceMode, isLoading } = useFeatureToggles();
  if (isLoading || !maintenanceMode) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-warning-100 px-3 py-2 text-xs text-warning-800 dark:bg-warning-500/20 dark:text-warning-100 sm:text-sm"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>
        {lang === "bn"
          ? "সাইটটি রক্ষণাবেক্ষণে আছে। অর্ডার বিলম্বিত হতে পারে।"
          : "The site is under maintenance. Orders may be delayed."}
      </span>
    </div>
  );
}
