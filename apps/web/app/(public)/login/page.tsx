"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { BD_PHONE_REGEX, PHONE_ERROR_BN, PHONE_ERROR_EN, normalizeBDPhone } from "@/lib/validation";

const schema = z.object({
  phone: z
    .string()
    .min(1, { message: PHONE_ERROR_EN })
    .regex(BD_PHONE_REGEX, { message: PHONE_ERROR_EN }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

// Route Segment Config — see apps/web/app/(public)/cart/page.tsx for rationale.
export const dynamic = "force-dynamic";

export default function PublicLoginPage() {
  const { lang } = useTheme();
  const delivery = useDeliveryPublicSafe();
  const auth = useAuth();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "", password: "" },
  });

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const phoneErr = lang === "bn" ? PHONE_ERROR_BN : PHONE_ERROR_EN;

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const phone = normalizeBDPhone(values.phone);
      const user = await auth.login(phone, values.password);
      toast.success(t("স্বাগতম!", `Welcome back, ${user.name}!`));
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } catch (e) {
      if (e instanceof ApiError) {
        const code = String(e.data?.message ?? e.message ?? "").toUpperCase();
        if (code.includes("USER_NOT_FOUND")) {
          toast.error(t("এই নম্বরে কোনো অ্যাকাউন্ট নেই", "No account found with this phone"));
          const phone = encodeURIComponent(normalizeBDPhone(values.phone));
          window.location.href = `/register?phone=${phone}`;
          return;
        }
        if (code.includes("PASSWORD_NOT_SET")) {
          toast.error(
            t(
              "অ্যাকাউন্ট সেটআপ সম্পূর্ণ করুন",
              "Please complete your account setup",
            ),
          );
          const phone = encodeURIComponent(normalizeBDPhone(values.phone));
          window.location.href = `/register?phone=${phone}&setup=1`;
          return;
        }
        if (code.includes("INVALID_CREDENTIALS")) {
          toast.error(t("ফোন বা পাসওয়ার্ড ভুল", "Wrong phone or password"));
          return;
        }
      }
      toast.error(t("লগইন ব্যর্থ হয়েছে", "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-primary-50 px-4 py-12 dark:bg-ink-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 shadow-lg rounded-2xl overflow-hidden">
            <BrandMark size={64} />
          </div>
          <CardTitle className="text-2xl">
            {t("XovenMart-এ লগইন", "Sign in to XovenMart")}
          </CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>
            {t("আপনার অ্যাকাউন্টে প্রবেশ করুন", "Sign in to your account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("মোবাইল নম্বর", "Phone number")}
              </label>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="01XXXXXXXXX"
                autoComplete="username"
                {...form.register("phone")}
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-danger-500">{phoneErr}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("পাসওয়ার্ড", "Password")}
              </label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((x) => !x)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-500 hover:text-ink-900"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-danger-500">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  {t("লগইন", "Sign in")}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm">
            <Link
              href="/forgot-password"
              className="text-primary-700 hover:underline dark:text-primary-100 block"
            >
              {t("পাসওয়ার্ড ভুলে গেছেন?", "Forgot password?")}
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1 text-ink-700 hover:text-ink-900 dark:text-ink-50"
            >
              {t("প্রথমবার? অ্যাকাউন্ট তৈরি করুন", "First time? Create an account")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
