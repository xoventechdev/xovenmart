"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { Eye, EyeOff, LogIn } from "lucide-react";

const schema = z.object({
  email: z.string().email("সঠিক ইমেইল দিন"),
  password: z.string().min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর"),
});

export default function AdminLoginPage() {
  const { lang } = useTheme();
  const delivery = useDeliveryPublicSafe();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      api.setAudience("admin");
      const data = await api.post("/auth/admin/login", values);
      api.setTokens(
        {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        },
        "admin"
      );
      toast.success(lang === "bn" ? "স্বাগতম!" : "Welcome!");
      // Hard reload so Next.js middleware sees the new `audience=admin`
      // cookie and lets us past the server-side gate.
      const next = new URLSearchParams(window.location.search).get("from") || "/admin";
      window.location.href = next;
    } catch (e: any) {
      toast.error(e?.data?.message || (lang === "bn" ? "লগইন ব্যর্থ" : "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4 dark:bg-ink-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 shadow-lg rounded-2xl overflow-hidden">
            <BrandMark size={64} />
          </div>
          <CardTitle className="text-2xl">{t("XovenMart অ্যাডমিন", "XovenMart Admin")}</CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>{t("আপনার অ্যাকাউন্টে লগইন করুন", "Sign in to your account")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ইমেইল", "Email")}
              </label>
              <Input
                type="email"
                placeholder="admin@xovenmart.com"
                autoComplete="username"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-danger-500">{form.formState.errors.email.message}</p>
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

            <p className="text-center text-xs text-ink-500">
              {t("ডেমো: admin@xovenmart.com / admin123", "Demo: admin@xovenmart.com / admin123")}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
