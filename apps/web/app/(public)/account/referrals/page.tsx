"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Gift,
  Send,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useMyReferrals, useMyReferrer } from "@/lib/use-referrals";
import { useFeatureToggles } from "@/lib/use-feature-toggles";
import { SharePopover } from "@/components/referrals/share-popover";
import { BrandMark } from "@/components/brand-mark";
import { api } from "@/lib/api";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, { bn: string; en: string; className: string }> = {
  PENDING: {
    bn: "অপেক্ষমান",
    en: "Pending",
    className: "bg-ink-100 text-ink-700 dark:bg-ink-200 dark:text-ink-900",
  },
  QUALIFIED: {
    bn: "যোগ্য",
    en: "Qualified",
    className: "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-100",
  },
  REWARDED: {
    bn: "পুরস্কৃত",
    en: "Rewarded",
    className: "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-100",
  },
  EXPIRED: {
    bn: "মেয়াদোত্তীর্ণ",
    en: "Expired",
    className: "bg-warning-50 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
  },
  CANCELLED: {
    bn: "বাতিল",
    en: "Cancelled",
    className: "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-100",
  },
};

export default function AccountReferralsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const fmtDate = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US") : "—";
  const fmtBDT = (n: number) => `৳${Number(n || 0).toLocaleString("en-US")}`;

  const toggles = useFeatureToggles();
  const referralsOn = toggles.enableReferrals;
  const { data, isLoading } = useMyReferrals();
  const referrer = useMyReferrer();

  const [shareOpen, setShareOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  // Show USED coupons in the list by default — they're part of the
  // customer's history (proof they earned + spent a reward). They render
  // greyed out so the available ones stand out. The user can toggle to
  // hide them if they only want to see what's left to spend.
  const [showUsed, setShowUsed] = useState(true);

  async function copyCode() {
    if (!data?.referralCode) return;
    try {
      await navigator.clipboard.writeText(data.referralCode);
      setCopyState("copied");
      toast.success(t("কোড কপি হয়েছে", "Code copied"));
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      toast.error(t("কপি ব্যর্থ", "Copy failed"));
    }
  }

  async function tryNativeShare() {
    if (!data) return;
    if (typeof navigator === "undefined" || !("share" in navigator)) {
      setShareOpen(true);
      return;
    }
    try {
      await navigator.share({
        title: t("XovenMart এ যোগ দিন", "Join me on XovenMart"),
        text: data.shareMessage,
        url: data.shareUrl,
      });
    } catch {
      // User cancelled or share API not allowed; fall back to popover.
      setShareOpen(true);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        <div className="h-32 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200" />
        <div className="h-48 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-ink-500">
          {t("তথ্য লোড করা যায়নি", "Couldn't load your referrals")}
        </CardContent>
      </Card>
    );
  }

  const stats = data.stats || {
    totalReferrals: 0,
    pending: 0,
    qualified: 0,
    rewarded: 0,
    totalRewardAmount: 0,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-ink-900 sm:text-2xl">
          {t("রেফারেল প্রোগ্রাম", "Referral Program")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "বন্ধুদের আমন্ত্রণ জানান এবং প্রতিটি সফল রেফারেলে পুরস্কার নিন",
            "Invite friends and earn rewards on every successful referral.",
          )}
        </p>
      </div>

      {/* Referrals paused banner — keeps the user informed that admin turned it off.
          Already-issued coupons remain redeemable; this is purely about new issuance. */}
      {!referralsOn && (
        <div className="flex items-start gap-2 rounded-md border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-500 dark:bg-warning-500/20 dark:text-warning-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <div className="font-medium">{t("রেফারেল বন্ধ আছে", "Referrals paused")}</div>
            <div className="mt-1 text-xs opacity-90">
              {t(
                "অ্যাডমিন নতুন রেফারেল সাময়িকভাবে বন্ধ রেখেছেন। আপনার পুরস্কৃত কুপনগুলো এখনো ব্যবহার করা যাবে।",
                "The admin has temporarily paused new referrals. Coupons you've already earned can still be redeemed.",
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <Card className="overflow-hidden border-primary-200 bg-gradient-to-br from-primary-50 via-white to-success-50 dark:border-primary-700 dark:from-primary-700/10 dark:via-ink-100 dark:to-success-700/10">
        <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-lg bg-white p-2 shadow dark:bg-ink-100">
              <BrandMark size={36} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">{t("আপনার রেফারেল কোড", "Your referral code")}</CardTitle>
              <CardDescription>
                {t("বন্ধুদের সাথে শেয়ার করুন — দুজনেই ৳50 পাবেন", "Share with friends — you both get ৳50")}
              </CardDescription>
            </div>
          </div>
          <Gift className="hidden h-8 w-8 text-primary-700 sm:block dark:text-primary-100" />
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Big referral code box — `text-xl` on mobile so 8-char codes
              fit comfortably on a 360px screen; `tracking-wide` instead
              of `tracking-widest` to keep it on one line. `break-all`
              as a safety net for very long codes. */}
          <div className="flex items-stretch gap-2">
            <code className="flex min-w-0 flex-1 select-all rounded-md border border-ink-300 bg-white px-3 py-2 font-mono text-xl font-bold tracking-wide break-all text-ink-900 dark:border-ink-300 dark:bg-ink-200 dark:text-ink-900 sm:px-4 sm:py-3 sm:text-2xl sm:tracking-widest">
              {data.referralCode}
            </code>
            <Button
              variant="outline"
              onClick={copyCode}
              aria-label="Copy code"
              className="shrink-0"
            >
              {copyState === "copied" ? (
                <CheckCircle2 className="h-4 w-4 text-success-700" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={tryNativeShare} disabled={!referralsOn} className="flex-1">
              <Send className="h-4 w-4" />
              {t("শেয়ার করুন", "Share invite")}
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/r/${data.referralCode}`} target="_blank">
                <ExternalLink className="h-4 w-4" />
                {t("প্রিভিউ দেখুন", "Preview landing page")}
              </Link>
            </Button>
          </div>

          {/* "Invited by ..." chip */}
          {referrer.data?.referrer && (
            <div className="rounded-md border border-info-200 bg-info-50 px-3 py-2 text-xs text-info-700 dark:border-info-700 dark:bg-info-700/20 dark:text-info-100">
              {t("আপনাকে আমন্ত্রণ জানিয়েছেন", "You were invited by")}{" "}
              <span className="font-semibold">{referrer.data.referrer.name}</span>{" "}
              <span className="opacity-70">({referrer.data.referrer.referralCode})</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats strip. Mobile: 2 columns. Tablet+: 5 columns. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label={t("মোট আমন্ত্রণ", "Total referrals")}
          value={stats.totalReferrals}
          color="info"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={t("অপেক্ষমান", "Pending")}
          value={stats.pending}
          color="muted"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={t("যোগ্য", "Qualified")}
          value={stats.qualified}
          color="info"
        />
        <StatCard
          icon={<Gift className="h-4 w-4" />}
          label={t("পুরস্কৃত", "Rewarded")}
          value={stats.rewarded}
          color="success"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label={t("মোট আয়", "Total earned")}
          value={fmtBDT(stats.totalRewardAmount)}
          color="success"
          isText
        />
      </div>

      {/* Invitees table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("আমন্ত্রিত বন্ধু", "Invited friends")}</CardTitle>
          <CardDescription>
            {t("আপনার কোড ব্যবহার করে যারা সাইনআপ করেছে", "People who signed up using your code")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.referrals.length === 0 ? (
            <div className="rounded-md border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500 dark:border-ink-300">
              {t(
                "এখনো কাউকে আমন্ত্রণ জানাননি। আপনার কোড শেয়ার করুন এবং আপনার প্রথম আমন্ত্রিত বন্ধুর জন্য ৳50 উপার্জন করুন।",
                "No invites yet. Share your code to earn ৳50 for your first successful invite.",
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500 dark:border-ink-300">
                    <th className="py-2 pr-3">{t("নাম", "Name")}</th>
                    <th className="py-2 pr-3">{t("ফোন", "Phone")}</th>
                    <th className="py-2 pr-3">{t("যোগদান", "Joined")}</th>
                    <th className="py-2 pr-3">{t("অবস্থা", "Status")}</th>
                    <th className="py-2">{t("পুরস্কৃত", "Rewarded at")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.map((r) => {
                    const status = STATUS_LABEL[r.status] ?? STATUS_LABEL.PENDING;
                    const maskedPhone = maskPhone(r.refereePhone);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-ink-100 last:border-0 dark:border-ink-200"
                      >
                        <td className="py-2 pr-3 font-medium text-ink-900 dark:text-ink-900">
                          {r.refereeName || "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-ink-700 dark:text-ink-900">
                          {maskedPhone}
                        </td>
                        <td className="py-2 pr-3 text-ink-600 dark:text-ink-700">
                          {fmtDate(r.refereeJoinedAt)}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                          >
                            {t(status.bn, status.en)}
                          </span>
                        </td>
                        <td className="py-2 text-ink-600 dark:text-ink-700">
                          {fmtDate(r.rewardedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rewards table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("আপনার পুরস্কার কুপন", "Your reward coupons")}</CardTitle>
          <CardDescription>
            {t("ব্যবহার করুন অথবা চেকআউটে প্রয়োগ করুন", "Use them at checkout")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.rewards.length === 0 ? (
            <div className="rounded-md border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500 dark:border-ink-300">
              {t(
                "এখনো কোনো কুপন নেই। একটি আমন্ত্রণ সম্পূর্ণ হলে এখানে দেখা যাবে।",
                "No coupons yet. They'll appear here once an invite is completed.",
              )}
            </div>
          ) : (
            <>
              {/* Filter toggle — show/hide USED rows. Default ON so the
                  customer can see the full history (including proof of
                  rewards they've spent). The available vs used split
                  is also surfaced below for at-a-glance visibility. */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-ink-500">
                  {(() => {
                    const total = data.rewards.length;
                    const used = data.rewards.filter((r: any) => r.redeemedAt).length;
                    const available = total - used;
                    if (used === 0) {
                      return t(
                        `${total} টি কুপন উপলব্ধ`,
                        `${total} coupon${total === 1 ? "" : "s"} available`,
                      );
                    }
                    return t(
                      `${available} টি উপলব্ধ · ${used} টি ব্যবহৃত`,
                      `${available} available · ${used} used`,
                    );
                  })()}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-ink-600 dark:text-ink-100">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-ink-300 text-primary focus:ring-primary"
                    checked={showUsed}
                    onChange={(e) => setShowUsed(e.target.checked)}
                  />
                  {t("ব্যবহৃত কুপন দেখান", "Show used coupons")}
                </label>
              </div>
              <div className="space-y-2">
                {data.rewards
                  .filter((rw: any) => (showUsed ? true : !rw.redeemedAt))
                  .map((rw: any) => (
                    <RewardRow key={rw.id} rw={rw} t={t} fmtDate={fmtDate} fmtBDT={fmtBDT} />
                  ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SharePopover
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={data.shareUrl}
        shareMessage={data.shareMessage}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  isText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: "info" | "success" | "muted";
  isText?: boolean;
}) {
  const colors = {
    info: "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-100",
    success: "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-100",
    muted: "bg-ink-100 text-ink-700 dark:bg-ink-200 dark:text-ink-900",
  } as const;
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3 dark:border-ink-300 dark:bg-ink-100">
      <div className={`mb-1 inline-flex items-center justify-center rounded-md p-1 ${colors[color]}`}>
        {icon}
      </div>
      <div className={`font-bold text-ink-900 dark:text-ink-900 ${isText ? "text-base" : "text-2xl"}`}>
        {value}
      </div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );
}

function RewardRow({
  rw,
  t,
  fmtDate,
  fmtBDT,
}: {
  rw: {
    id: string;
    couponCode: string;
    amount: number;
    issuedAt: string;
    redeemedAt: string | null;
  };
  t: (bn: string, en: string) => string;
  fmtDate: (s: string | null | undefined) => string;
  fmtBDT: (n: number) => string;
}) {
  const [copied, setCopied] = useState(false);
  const used = !!rw.redeemedAt;
  async function copy() {
    try {
      await navigator.clipboard.writeText(rw.couponCode);
      setCopied(true);
      toast.success(t("কুপন কোড কপি হয়েছে", "Coupon copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("কপি ব্যর্থ", "Copy failed"));
    }
  }
  return (
    // Greyed out when redeemed so the available coupons stand out. The
    // USED badge on the right + the redeeming date below the code make
    // it obvious WHY the row looks dim — no ambiguity about whether the
    // coupon is still good or already spent. `aria-disabled` keeps the
    // semantics honest for assistive tech.
    <div
      aria-disabled={used}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition ${
        used
          ? "border-ink-200 bg-ink-50 opacity-70 dark:border-ink-300 dark:bg-ink-100"
          : "border-ink-200 bg-white dark:border-ink-300 dark:bg-ink-50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className={`flex items-center gap-1 rounded font-mono text-sm font-bold tracking-widest ${
              used
                ? "text-ink-500 line-through dark:text-ink-700"
                : "text-ink-900 hover:text-primary-700 dark:text-ink-900 dark:hover:text-primary-100"
            }`}
          >
            {rw.couponCode}
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success-700" />
            ) : (
              <Copy className="h-3.5 w-3.5 opacity-60" />
            )}
          </button>
          <span
            className={`text-sm font-medium ${
              used ? "text-ink-500 dark:text-ink-700" : "text-success-700"
            }`}
          >
            {fmtBDT(rw.amount)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-ink-500">
          {t("প্রদান", "Issued")} {fmtDate(rw.issuedAt)}
          {rw.redeemedAt && ` · ${t("ব্যবহৃত", "Redeemed")} ${fmtDate(rw.redeemedAt)}`}
        </div>
      </div>
      <div>
        {used ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink-200 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-300 dark:text-ink-900">
            <CheckCircle2 className="h-3 w-3" />
            {t("ব্যবহৃত", "Used")}
          </span>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/checkout">{t("ব্যবহার করুন", "Use it")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Mask a phone number so only the last 4 digits show. Keeps enough for
 * the customer to recognize their invitees without exposing the full
 * number on the dashboard.
 */
function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return digits ? `••• ${digits}` : "—";
  return `••• ${digits.slice(-4)}`;
}