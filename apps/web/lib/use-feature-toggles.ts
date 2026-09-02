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
 */
export interface FeatureToggles {
  enableCOD: boolean;
  enableBkash: boolean;
  enableNagad: boolean;
  enableReferrals: boolean;
  enableLoyalty: boolean;
  enablePushNotifications: boolean;
  maintenanceMode: boolean;
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
  maintenanceMode: false,
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
 */
export function useFeatureToggles() {
  const q = useQuery({
    queryKey: ["feature-toggles", "public"],
    queryFn: async () => {
      const res = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"
        }/public/feature-toggles`,
      );
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
