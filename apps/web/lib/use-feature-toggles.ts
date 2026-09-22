"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Public read of the admin's feature-toggle flags. Mirrors the type used
 * by the admin `/admin/system/feature-toggles` page so the two never
 * drift out of sync. Same field names, same defaults.
 *
 * The defaults here MUST match the backend's `FeatureTogglesPublicController`
 * fallback values — otherwise a cold user (no cache, API not yet hit)
 * sees a different state than the API will eventually serve.
 *
 * NOTE: `maintenanceMode` used to live here. It was removed as part of
 * the single-source-of-truth consolidation — the public site now reads
 * `/public/maintenance` via `useMaintenance()` instead. Keeping it here
 * would let an admin enable a "banner-only" mode that contradicts the
 * dedicated `/admin/system/maintenance` toggle.
 */
export interface FeatureToggles {
  enableCOD: boolean;
  enableBkash: boolean;
  enableNagad: boolean;
  enableReferrals: boolean;
  enableLoyalty: boolean;
  enablePushNotifications: boolean;
  registrationOpen: boolean;
}

// Permissive defaults so the public site keeps working before the first
// API response lands (or if the API is briefly unreachable). An admin
// who wants to disable a feature must do it deliberately; an unconfigured
// dev install should keep everything on.
const DEFAULT_TOGGLES: FeatureToggles = {
  enableCOD: true,
  enableBkash: false,
  enableNagad: false,
  enableReferrals: true,
  enableLoyalty: false,
  enablePushNotifications: true,
  registrationOpen: true,
};

/**
 * React hook used by every user-facing page that needs to know whether a
 * admin-toggleable feature is currently available. Returns an object of
 * booleans, plus `isLoading` for the very first render.
 *
 * Cached for 60 s by TanStack Query. After an admin saves at
 * `/admin/system/feature-toggles`, the admin panel calls
 * `qc.invalidateQueries({ queryKey: ["feature-toggles", "public"] })` to
 * force a refetch on the next user-facing page render.
 *
 * Build-time short-circuit: when `next build` runs the prerender pass
 * (NEXT_PHASE === "phase-production-build") the API container isn't up
 * yet, so a real fetch would hang 60s on connect-refused and blow up
 * the build with "took more than 60 seconds" on every page that wraps
 * this hook (i.e. every page in the `(public)` layout, since
 * `SiteHeader` / `SiteFooter` / `SupportFab` all read it). Skip the
 * fetch entirely and return the permissive defaults.
 */
export function useFeatureToggles() {
  const q = useQuery({
    queryKey: ["feature-toggles", "public"],
    queryFn: async () => {
      // Skip during `next build` — no api at build time.
      if (
        typeof process !== "undefined" &&
        process.env.NEXT_PHASE === "phase-production-build"
      ) {
        return DEFAULT_TOGGLES;
      }
      const base =
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
          /\/api\/v\d+\/?$/,
          "",
        );
      const res = await fetch(`${base}/api/v1/public/feature-toggles`);
      if (!res.ok) throw new Error("Failed to load feature toggles");
      return (await res.json()) as FeatureToggles;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  return {
    ...DEFAULT_TOGGLES,
    ...(q.data ?? {}),
    isLoading: q.isLoading,
  };
}
