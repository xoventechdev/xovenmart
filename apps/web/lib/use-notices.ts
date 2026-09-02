"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Public, admin-editable notice row. Drives the marquee / alert strip on
 * the user-facing site. Mirrors the shape returned by `GET /notices/public`
 * — the admin CRUD returns additional audit fields but the public payload
 * is intentionally a strict subset for cache-friendly public consumption.
 */
export interface PublicNotice {
  id: string;
  textBn: string;
  textEn: string;
  linkUrl: string | null;
  linkLabelBn: string | null;
  linkLabelEn: string | null;
  severity: "info" | "warning" | "success" | "danger";
  position: string; // "top" | "below_header" | …
}

/**
 * Hook used by every public page that wants to render the site-wide notice
 * strip. Returns the active notices (server already filters by isActive +
 * time window) with safe fallbacks so the page renders nothing before the
 * API responds (or if it fails).
 *
 * Cached for 5 minutes by TanStack Query; admins can call
 * `qc.invalidateQueries({ queryKey: ["notices", "public"] })` after saving
 * if they want an instant refresh.
 */
export function useNoticesPublic() {
  const q = useQuery({
    queryKey: ["notices", "public"],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"}/notices/public`,
      );
      if (!res.ok) throw new Error("Failed to load notices");
      return (await res.json()) as PublicNotice[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const items: PublicNotice[] = q.data ?? [];
  return { items, isLoading: q.isLoading };
}

/**
 * SSR / error-safe variant — returns an empty array when called outside
 * a QueryClient context (e.g. in an error boundary) so the page still
 * renders without crashing.
 */
export function useNoticesPublicSafe(): { items: PublicNotice[]; isLoading: boolean } {
  try {
    return useNoticesPublic();
  } catch {
    return { items: [], isLoading: false };
  }
}