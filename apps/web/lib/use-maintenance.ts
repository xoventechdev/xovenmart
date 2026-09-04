"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Public read of the admin's maintenance state.
 *
 * Single source of truth for "is the public site locked?" — the admin
 * edits this from `/admin/system/maintenance` and the public layout
 * reads it from here to decide whether to render the lock page.
 *
 * This hook intentionally does NOT pull from `useFeatureToggles` — the
 * previous dual-flag setup (a `feature.maintenanceMode` toggle on the
 * Feature Toggles page that drove a yellow banner, plus this
 * `maintenance.enabled` flag that drove nothing) is gone. There is
 * exactly one switch now.
 *
 * Cache: 30 s staleTime. Faster than `useFeatureToggles` (60 s) so an
 * admin's flip-on / flip-off feels close to real-time to anyone with
 * the public site already open. Worst-case stale window for a brand
 * new visitor is 30 s.
 */
export interface Maintenance {
  enabled: boolean;
  message: string;
  startsAt: string | null;
  endsAt: string | null;
}

// Defensive default — if the API is briefly unreachable we keep the
// site open rather than accidentally locking everyone out.
const DEFAULT_MAINTENANCE: Maintenance = {
  enabled: false,
  message: "",
  startsAt: null,
  endsAt: null,
};

export function useMaintenance() {
  const q = useQuery({
    queryKey: ["maintenance", "public"],
    queryFn: async () => {
      const base =
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
          /\/api\/v\d+\/?$/,
          "",
        );
      const res = await fetch(`${base}/api/v1/public/maintenance`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load maintenance state");
      return (await res.json()) as Maintenance;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  return {
    ...DEFAULT_MAINTENANCE,
    ...(q.data ?? {}),
    isLoading: q.isLoading,
  };
}
