"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/**
 * My referrals payload — mirrors `ReferralsService.myReferrals` in the API.
 * Used by `/account/referrals`. The shape is intentionally permissive: any
 * field the API doesn't yet return is treated as `null` so older clients
 * can still render the page when the backend adds new fields later.
 */
export interface MyReferral {
  id: string;
  refereeName: string;
  refereePhone: string;
  refereeJoinedAt: string;
  status: "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED" | "CANCELLED";
  rewardedAt: string | null;
}

export interface MyReferralReward {
  id: string;
  couponCode: string;
  amount: number;
  issuedAt: string;
  redeemedAt: string | null;
}

export interface MyReferralsPayload {
  referralCode: string;
  shareUrl: string;
  shareMessage: string;
  stats: {
    totalReferrals: number;
    pending: number;
    qualified: number;
    rewarded: number;
    totalRewardAmount: number;
  };
  referrals: MyReferral[];
  rewards: MyReferralReward[];
}

export interface MyReferrerPayload {
  referrer: { name: string; referralCode: string } | null;
}

/**
 * React hook for the customer's own referrals dashboard. Returns the
 * raw TanStack `useQuery` result so the caller can decide loading vs.
 * error UX. Cached 30 s — same as the other customer endpoints
 * (orders, addresses) so a back-and-forth page navigation doesn't
 * thrash the API.
 */
export function useMyReferrals() {
  return useQuery<MyReferralsPayload>({
    queryKey: ["referrals", "me"],
    queryFn: () => api.get("/referrals/me") as Promise<MyReferralsPayload>,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

/** Lightweight read of just the referrer — used by the "Invited by X" chip
 *  on the dashboard + the share landing page header. */
export function useMyReferrer() {
  return useQuery<MyReferrerPayload>({
    queryKey: ["referrals", "my-referrer"],
    queryFn: () => api.get("/referrals/referrer") as Promise<MyReferrerPayload>,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

/**
 * Public (no-auth) lookup of a referral code — used by `/r/[code]` and
 * the `/register` preview banner. Does NOT require the user to be
 * authenticated. Returns:
 *   { valid: true, referrerName, referrerFullName, initial,
 *     referrerJoinedAt, referralCode } — found
 *   { valid: false } — not found OR malformed
 */
export interface ReferralPreview {
  valid: boolean;
  /** First name only (legacy — kept for the register banner). */
  referrerName?: string;
  /** Full display name (e.g. "Md Kamal Hosen") — preferred on the
   *  /r/[code] landing page so the visitor recognises the inviter. */
  referrerFullName?: string;
  initial?: string;
  referrerJoinedAt?: string | null;
  /** The 8-char referral code verbatim — landing page renders this
   *  next to the inviter name so the visitor can copy it. */
  referralCode?: string;
}

export function useReferralPreview(code: string | null | undefined) {
  const normalized = (code ?? "").toUpperCase().trim();
  return useQuery<ReferralPreview>({
    queryKey: ["referral-preview", normalized],
    queryFn: async () => {
      const res = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"
        }/referral-codes/${encodeURIComponent(normalized)}`,
      );
      if (!res.ok) return { valid: false };
      return (await res.json()) as ReferralPreview;
    },
    enabled: /^[A-Z0-9]{8}$/.test(normalized),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
}
