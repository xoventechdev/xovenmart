"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Copy, Gift, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand-lockup";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { useFeatureToggles } from "@/lib/use-feature-toggles";
import { useReferralPreview } from "@/lib/use-referrals";
import { useAuth } from "@/lib/auth";

/**
 * Share landing page — `/r/[code]`.
 *
 * When an existing customer copies their invite link and shares it, the
 * recipient lands here. We:
 *   1. Look up the referrer (public endpoint, returns the full
 *      display name — privacy-safe: no phone, no email, no user id).
 *   2. Show the inviter's full name + the 8-char code (with a copy
 *      button) so the visitor can confirm who's inviting them.
 *   3. Set a 30-day `xm-ref` cookie so the `/register` form (and now
 *      `/login`) can autofill the referral code field on subsequent
 *      navigations.
 *   4. If the visitor is already logged in (e.g. a tester, or they came
 *      from their own share link), clear the cookie — we never want a
 *      logged-in user's referral cookie to leak onto the next device
 *      they share the browser with.
 *   5. If the admin has turned referrals OFF in
 *      `/admin/system/feature-toggles`, redirect to `/` (homepage)
 *      immediately instead of rendering a "paused" landing. The user
 *      said: "user view a reffer link that time, it have to redirect
 *      to root /". A 30-second `useFeatureToggles` cache may briefly
 *      show a flash before the redirect fires; that's acceptable since
 *      (a) we'd rather show the paused view for one paint than gate on
 *      a hard server-rendered fetch, and (b) the toggle is admin-
 *      rare-event, not user-rare-event.
 *
 * The page always renders something useful — even on `{valid: false}`,
 * the CTA still works. We never error publicly; this is a marketing
 * surface and dead-ends hurt conversion.
 */
export default function ReferralLandingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();
  const toggles = useFeatureToggles();
  const referralsOn = toggles.enableReferrals;
  const auth = useAuth();

  // Code from URL — normalize + validate client-side before sending to API
  const rawCode = (params?.code ?? "").toString();
  const code = useMemo(() => rawCode.toUpperCase().trim(), [rawCode]);
  const isValidFormat = /^[A-Z0-9]{8}$/.test(code);

  const preview = useReferralPreview(isValidFormat ? code : null);

  // Cookie side-effects — write the referral code on first valid load,
  // clear it if the visitor is already authenticated (Phase D guard).
  const [cookieHandled, setCookieHandled] = useState(false);

  // Redirect-to-home when referrals are disabled. We wait out the
  // initial toggle query (max 60 s staleTime, but typically <300 ms)
  // so the redirect happens against the *real* server value, not the
  // optimistic default. Using `router.replace` (not `push`) keeps the
  // back button working normally — pressing Back from `/` won't bring
  // you back to the share landing.
  useEffect(() => {
    if (toggles.isLoading) return;
    if (!referralsOn) {
      router.replace("/");
    }
  }, [toggles.isLoading, referralsOn, router]);

  useEffect(() => {
    if (cookieHandled) return;

    // Already logged in: don't let the cookie stick. The visitor came
    // here from their own share link on a different device, or they're
    // testing. Removing it on first paint prevents a stale leak.
    if (auth.isAuthenticated) {
      clearReferralCookie();
      setCookieHandled(true);
      return;
    }

    if (isValidFormat) {
      writeReferralCookie(code);
    }
    setCookieHandled(true);
  }, [auth.isAuthenticated, isValidFormat, code, cookieHandled]);

  const tagline = lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn;
  const brandName = lang === "en" ? general.store.nameEn : general.store.nameBn;
  const isLoading = preview.isLoading && isValidFormat;

  // Early-return AFTER every hook above. Putting it here (instead of
  // between hooks) is what fixed the React #300 "Rendered fewer hooks
  // than expected" crash: when `toggles.isLoading` flips from true to
  // false on the second render, all hooks above still fire in the
  // same order, then we just choose to render `null` instead of the
  // card. Skipping rendering one paint while the redirect runs also
  // avoids the "Referrals paused" banner flash.
  if (!toggles.isLoading && !referralsOn) {
    return null;
  }

  // ─── Render branches ─────────────────────────────────────────────
  // Three states:
  //   1. Referrals paused (toggle off)
  //   2. Valid referral — "Invited by Rahim" hero
  //   3. Unknown / invalid — neutral hero, still useful CTA

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-primary-50 px-4 py-12 dark:bg-ink-900">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-3 shadow-lg rounded-2xl overflow-hidden">
            <BrandLockup
              size={72}
              logoUrl={general.brand.logoUrl}
              logoDarkUrl={general.brand.logoDarkUrl}
            />
          </div>
          <CardTitle className="text-2xl">{brandName || "XovenMart"}</CardTitle>
          {tagline && (
            <p className="text-sm italic text-muted-foreground">{tagline}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Pause banner */}
          {!referralsOn && (
            <div className="rounded-md border border-warning-300 bg-warning-50 p-3 text-left text-sm text-warning-800 dark:border-warning-500 dark:bg-warning-500/20 dark:text-warning-100">
              {t(
                "রেফারেল প্রোগ্রাম সাময়িকভাবে বন্ধ আছে।",
                "The referral program is temporarily paused.",
              )}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center gap-2 py-6 text-ink-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">{t("লোড হচ্ছে...", "Loading…")}</span>
            </div>
          )}

          {/* Valid referral — show inviter full name + code so the
              visitor can confirm the invite is really from their friend
              before they sign up. `initial` (avatar fallback) is derived
              from the full name now, so "Md Kamal" → "M". */}
          {!isLoading && preview.data?.valid && (
            <>
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-700/30 dark:text-primary-100">
                  <span className="text-2xl font-bold">
                    {preview.data.initial || "A"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-700">
                  <Sparkles className="h-4 w-4 text-warning-500" />
                  <span>
                    {t("আপনাকে আমন্ত্রণ জানিয়েছেন", "You're invited by")}{" "}
                    <span className="font-semibold text-ink-900 dark:text-ink-900">
                      {/* Prefer the full display name so the visitor can
                          recognise the inviter; fall back to the legacy
                          first-name field if an older backend is in
                          front of us. */}
                      {preview.data.referrerFullName || preview.data.referrerName}
                    </span>
                  </span>
                </div>
                {preview.data.referralCode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (
                        typeof navigator !== "undefined" &&
                        navigator.clipboard
                      ) {
                        navigator.clipboard
                          .writeText(preview.data.referralCode!)
                          .catch(() => {
                            /* clipboard write failed — non-fatal, the
                               user can still copy from the visible code */
                          });
                      }
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 font-mono text-xs font-semibold text-primary-800 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-800/40 dark:text-primary-100"
                    aria-label={t("রেফারেল কোড কপি করুন", "Copy referral code")}
                    title={t("রেফারেল কোড কপি করুন", "Copy referral code")}
                  >
                    <Copy className="h-3 w-3" />
                    <span>{preview.data.referralCode}</span>
                  </button>
                )}
              </div>

              <div className="rounded-lg border border-success-200 bg-success-50 p-4 dark:border-success-700 dark:bg-success-700/20">
                <div className="flex items-center justify-center gap-2 text-success-700 dark:text-success-100">
                  <Gift className="h-5 w-5" />
                  <span className="text-lg font-bold">
                    {t("উভয়পক্ষ ৳50 ছাড় পাবেন", "You both get ৳50 off")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-success-800 dark:text-success-100">
                  {t(
                    "সাইনআপ করুন এবং প্রথম ডেলিভারি সম্পন্ন অর্ডারে ছাড় পান",
                    "Sign up and earn the discount on your first delivered order",
                  )}
                </p>
              </div>
            </>
          )}

          {/* Unknown code — still render the CTA so we don't dead-end */}
          {!isLoading && preview.data && !preview.data.valid && (
            <div className="py-2">
              <Gift className="mx-auto h-10 w-10 text-primary-700 dark:text-primary-100" />
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-700">
                {t(
                  "আপনাকে XovenMart এ আমন্ত্রণ জানানো হয়েছে।",
                  "You've been invited to XovenMart.",
                )}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {t(
                  "সাইনআপ করলে আপনার প্রথম অর্ডারে ৳50 ছাড় পাবেন।",
                  "Sign up and get ৳50 off your first order.",
                )}
              </p>
            </div>
          )}

          {/* CTAs */}
          <div className="space-y-2 pt-2">
            {auth.isAuthenticated ? (
              <Button asChild className="w-full" size="lg">
                <Link href="/">
                  {t("হোমে যান", "Go to home")}
                </Link>
              </Button>
            ) : (
              <Button
                asChild={referralsOn}
                disabled={!referralsOn}
                className="w-full"
                size="lg"
              >
                {referralsOn ? (
                  <Link href={`/register?ref=${encodeURIComponent(code)}`}>
                    {t("অ্যাকাউন্ট তৈরি করুন ও ৳50 পান", "Create account & get ৳50")}
                  </Link>
                ) : (
                  <span>{t("রেফারেল বন্ধ আছে", "Referrals paused")}</span>
                )}
              </Button>
            )}

            <Link
              href="/"
              className="block text-xs text-ink-500 hover:underline"
            >
              {t("পরে দেখব", "Maybe later")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const REF_COOKIE = "xm-ref";
const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function writeReferralCookie(code: string) {
  if (typeof document === "undefined") return;
  const v = encodeURIComponent(code);
  // Lax so the cookie is sent on top-level navigations but not on
  // cross-site sub-requests. Path=/ so the register form (at /register)
  // can read it.
  document.cookie = `${REF_COOKIE}=${v}; Path=/; Max-Age=${REF_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearReferralCookie() {
  if (typeof document === "undefined") return;
  // Server-equivalent of clearing: set Max-Age=0 and an empty value.
  // The path MUST match the original write path.
  document.cookie = `${REF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}