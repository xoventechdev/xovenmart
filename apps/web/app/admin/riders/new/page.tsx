"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Save, ArrowLeft, Bike, Mail, Phone, User, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function NewRiderPage() {
  const router = useRouter();
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    nidNumber: "",
  });

  const save = useMutation({
    mutationFn: () =>
      api.post("/admin/riders/create", {
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone,
        nidNumber: form.nidNumber || undefined,
      }),
    onSuccess: () => {
      toast.success(t("রাইডার তৈরি হয়েছে", "Rider created"));
      router.push("/admin/riders");
    },
    onError: (e: any) =>
      toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  const valid =
    form.email && form.password.length >= 6 && form.name && form.phone;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/riders"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("রাইডার তালিকায়", "Back to riders")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("নতুন রাইডার", "Add Rider")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "নতুন ডেলিভারি রাইডারের অ্যাকাউন্ট তৈরি করুন",
            "Create a new delivery rider account",
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bike className="h-4 w-4" /> {t("লগইন তথ্য", "Login Credentials")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field
            label={t("ইমেইল", "Email")}
            hint={t("রাইডার লগইন করবে এই ইমেইলে", "Rider will login with this email")}
          >
            <div className="relative">
              <Mail className="absolute left-2 top-2.5 h-4 w-4 text-ink-400" />
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, email: e.target.value }))
                }
                placeholder="rider@example.com"
                className="pl-8"
              />
            </div>
          </Field>
          <Field
            label={t("পাসওয়ার্ড", "Password")}
            hint={t("কমপক্ষে ৬ অক্ষর", "At least 6 characters")}
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((s) => ({ ...s, password: e.target.value }))
              }
              placeholder="••••••••"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" /> {t("ব্যক্তিগত তথ্য", "Personal Info")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label={t("নাম", "Full Name")}>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder={t("যেমন: রহিম মিয়া", "e.g. Rahim Mia")}
            />
          </Field>
          <Field label={t("ফোন", "Phone")}>
            <div className="relative">
              <Phone className="absolute left-2 top-2.5 h-4 w-4 text-ink-400" />
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((s) => ({ ...s, phone: e.target.value }))
                }
                placeholder="01712-345678"
                className="pl-8"
              />
            </div>
          </Field>
          <Field
            label={t("NID নম্বর (ঐচ্ছিক)", "NID Number (optional)")}
            hint={t(
              "জাতীয় পরিচয়পত্র নম্বর",
              "National ID card number",
            )}
            className="md:col-span-2"
          >
            <div className="relative">
              <CreditCard className="absolute left-2 top-2.5 h-4 w-4 text-ink-400" />
              <Input
                value={form.nidNumber}
                onChange={(e) =>
                  setForm((s) => ({ ...s, nidNumber: e.target.value }))
                }
                placeholder="1234567890"
                className="pl-8"
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/admin/riders">
          <Button variant="outline">{t("বাতিল", "Cancel")}</Button>
        </Link>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !valid}>
          <Save className="h-4 w-4" />{" "}
          {save.isPending ? t("তৈরি হচ্ছে...", "Creating...") : t("তৈরি করুন", "Create Rider")}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}