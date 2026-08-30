"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Phone, Mail, MapPin, Globe, MessageCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ContactInfo {
  supportPhone: string;
  supportEmail: string;
  addressLine1Bn?: string;
  addressLine1En?: string;
  addressLine2Bn?: string;
  addressLine2En?: string;
  cityBn?: string;
  cityEn?: string;
  businessHoursBn?: string;
  businessHoursEn?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  whatsappNumber?: string;
}

export default function ContactPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings"),
  });

  const [form, setForm] = useState<ContactInfo>({
    supportPhone: "",
    supportEmail: "",
    addressLine1Bn: "",
    addressLine1En: "",
    addressLine2Bn: "",
    addressLine2En: "",
    cityBn: "",
    cityEn: "",
    businessHoursBn: "",
    businessHoursEn: "",
    facebookUrl: "",
    instagramUrl: "",
    whatsappNumber: "",
  });

  useEffect(() => {
    if (!data) return;
    setForm((s) => ({ ...s, ...data }));
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.post("/settings", form),
    onSuccess: () => {
      toast.success(t("যোগাযোগের তথ্য সংরক্ষিত হয়েছে", "Contact info saved"));
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["seo", "public"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("যোগাযোগের তথ্য", "Contact Info")}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("পাবলিক ওয়েবসাইট ও অ্যাপে প্রদর্শিত যোগাযোগের তথ্য", "Contact info shown on the public site & app")}
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="h-4 w-4" />}
          {t("সংরক্ষণ করুন", "Save")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Support */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4" /> {t("সাপোর্ট চ্যানে�", "Support Channels")}</CardTitle>
            <CardDescription>{t("কাস্টমাররা কিভাবে যোগাযোগ করবে", "How customers reach you")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label={t("সাপোর্ট ফোন", "Support Phone")} icon={Phone}>
              <Input value={form.supportPhone ?? ""} onChange={(e) => setForm((s) => ({ ...s, supportPhone: e.target.value }))} />
            </Field>
            <Field label={t("সাপোর্ট ইমেইল", "Support Email")} icon={Mail}>
              <Input type="email" value={form.supportEmail ?? ""} onChange={(e) => setForm((s) => ({ ...s, supportEmail: e.target.value }))} />
            </Field>
            <Field label={t("হোয়াটস�্যাপ নাম্বার", "WhatsApp Number")} icon={MessageCircle}>
              <Input value={form.whatsappNumber ?? ""} onChange={(e) => setForm((s) => ({ ...s, whatsappNumber: e.target.value }))} placeholder="+8801720694513" />
            </Field>
          </CardContent>
        </Card>

        {/* Social */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> {t("সোশ্যাল মিডিয়া", "Social Media")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Facebook">
              <Input type="url" value={form.facebookUrl ?? ""} onChange={(e) => setForm((s) => ({ ...s, facebookUrl: e.target.value }))} placeholder="https://facebook.com/xovenmart" />
            </Field>
            <Field label="Instagram">
              <Input type="url" value={form.instagramUrl ?? ""} onChange={(e) => setForm((s) => ({ ...s, instagramUrl: e.target.value }))} placeholder="https://instagram.com/xovenmart" />
            </Field>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {t("ঠিকানা", "Address")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("ঠিকানা (বাংলা)", "Address (BN)")}>
                <Input value={form.addressLine1Bn ?? ""} onChange={(e) => setForm((s) => ({ ...s, addressLine1Bn: e.target.value }))} />
              </Field>
              <Field label={t("ঠিকানা (EN)", "Address (EN)")}>
                <Input value={form.addressLine1En ?? ""} onChange={(e) => setForm((s) => ({ ...s, addressLine1En: e.target.value }))} />
              </Field>
              <Field label={t("শহর (বাংলা)", "City (BN)")}>
                <Input value={form.cityBn ?? ""} onChange={(e) => setForm((s) => ({ ...s, cityBn: e.target.value }))} />
              </Field>
              <Field label={t("শহর (EN)", "City (EN)")}>
                <Input value={form.cityEn ?? ""} onChange={(e) => setForm((s) => ({ ...s, cityEn: e.target.value }))} />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> {t("ব্যবসায়িক সময়", "Business Hours")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label={t("ব্যবসায়িক সময় (বা�লা)", "Hours (BN)")}>
              <Input value={form.businessHoursBn ?? ""} onChange={(e) => setForm((s) => ({ ...s, businessHoursBn: e.target.value }))} placeholder="সকাল ৯টা - রাত �০টা (শুক্রবার বন্ধ)" />
            </Field>
            <Field label={t("ব্যবসায়িক সময় (EN)", "Hours (EN)")}>
              <Input value={form.businessHoursEn ?? ""} onChange={(e) => setForm((s) => ({ ...s, businessHoursEn: e.target.value }))} placeholder="9 AM - 10 PM (Closed Friday)" />
            </Field>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-sm font-medium text-ink-700 dark:text-ink-900">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
    </div>
  );
}
