"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { extractApiMessage } from "@/lib/api";
import { toast } from "sonner";

interface ReferralSettings {
  rewardAmount: number;
  couponTtlDays: number;
  minOrder: number;
  enabled: boolean;
}

const DEFAULTS: ReferralSettings = {
  rewardAmount: 50,
  couponTtlDays: 60,
  minOrder: 0,
  enabled: true,
};

/**
 * Admin-editable referral reward knobs.
 *
 * Wired to `GET /admin/system/referral-settings` (manager+) and
 * `PATCH /admin/system/referral-settings` (admin only). Saving here:
 *
 *   1. Updates the `referral.rewardAmount`, `referral.couponTtlDays`,
 *      `referral.minOrder` rows in `app_settings` — these are read at
 *      coupon-issue time by `ReferralsService.onOrderDelivered`, so the
 *      new value applies to the NEXT first-delivered-order, not
 *      retroactively.
 *   2. Updates `feature.enableReferrals` (the same canonical key the
 *      feature-toggles public endpoint reads) so the on/off switch
 *      here and the master switch on `/admin/system/feature-toggles`
 *      stay in sync — there's only one source of truth.
 *
 * Defaults match the legacy hardcoded values so an unconfigured install
 * keeps the same behavior.
 */
export default function ReferralSettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "system", "referral-settings"],
    queryFn: () => api.get("/admin/system/referral-settings") as Promise<ReferralSettings>,
  });

  const [form, setForm] = useState<ReferralSettings>(DEFAULTS);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (next: ReferralSettings) =>
      api.patch("/admin/system/referral-settings", next) as Promise<ReferralSettings>,
    onSuccess: (next) => {
      toast.success("Saved");
      qc.setQueryData(["admin", "system", "referral-settings"], next);
      // The on/off switch shares storage with the feature-toggles card,
      // so invalidate both. The user-facing `useFeatureToggles` hook
      // refetches within 60s, but in the same admin session this fires
      // a refresh immediately so cross-tab toggles feel live.
      qc.invalidateQueries({ queryKey: ["admin", "system", "feature-toggles"] });
      qc.invalidateQueries({ queryKey: ["feature-toggles", "public"] });
    },
    onError: (e) => toast.error(extractApiMessage(e, "Save failed")),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">Referral Rewards</h1>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">Referral Rewards</h1>
          <p className="mt-1 text-sm text-ink-500">
            Tune the coupon value, expiry, and minimum order applied when a referee's first
            order is delivered.
          </p>
        </div>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Reward knobs
          </CardTitle>
          <CardDescription>
            These values apply to the next referral that completes — not retroactively to
            already-issued coupons.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field
            label="Reward amount (৳)"
            hint="Flat discount applied to both the referrer and referee coupons."
          >
            <Input
              type="number"
              min={0}
              step={1}
              value={form.rewardAmount}
              onChange={(e) =>
                setForm((s) => ({ ...s, rewardAmount: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="max-w-[180px]"
            />
          </Field>

          <Field
            label="Coupon validity (days)"
            hint="How long the issued coupons remain redeemable."
          >
            <Input
              type="number"
              min={1}
              max={365}
              step={1}
              value={form.couponTtlDays}
              onChange={(e) =>
                setForm((s) => ({ ...s, couponTtlDays: Math.max(1, Number(e.target.value) || 1) }))
              }
              className="max-w-[180px]"
            />
          </Field>

          <Field
            label="Minimum order (৳)"
            hint="Cart subtotal must reach this amount before the coupon applies. 0 = no minimum."
          >
            <Input
              type="number"
              min={0}
              step={1}
              value={form.minOrder}
              onChange={(e) =>
                setForm((s) => ({ ...s, minOrder: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="max-w-[180px]"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enable / disable</CardTitle>
          <CardDescription>
            When disabled, no new referral relationships are recorded and no rewards are issued.
            Already-issued coupons remain redeemable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
              className="h-5 w-5 rounded border-ink-300 text-primary-700"
            />
            <span className="text-sm font-medium text-ink-900 dark:text-ink-900">
              Referrals enabled
            </span>
          </label>
        </CardContent>
      </Card>

      <p className="text-xs text-ink-500">
        The on/off switch here shares storage with{" "}
        <code className="rounded bg-ink-100 px-1 py-0.5 dark:bg-ink-200">
          feature.enableReferrals
        </code>{" "}
        on the Feature Toggles page. Saving here also flips the toggle there.
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div>{children}</div>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
