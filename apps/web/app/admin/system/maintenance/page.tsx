"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Wrench, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Maintenance {
  enabled: boolean;
  message: string;
  startsAt: string | null;
  endsAt: string | null;
  scheduledWindows: any[];
}

export default function MaintenancePage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin", "system", "maintenance"],
    queryFn: () => api.get("/admin/system/maintenance") as Promise<Maintenance>,
  });

  const [form, setForm] = useState<Maintenance | null>(null);
  useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        message: data.message ?? "",
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        scheduledWindows: data.scheduledWindows ?? [],
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: Maintenance) =>
      api.post("/admin/system/maintenance", {
        enabled: payload.enabled,
        message: payload.message,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      }),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "system", "maintenance"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Update failed"),
  });

  if (!form) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("রক্ষণাবেক্ষণ মোড", "Maintenance Mode")}
        </h1>
        <div className="h-48 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("রক্ষণাবেক্ষণ মোড", "Maintenance Mode")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("সাইট সাময়িকভাবে বন্ধ রাখুন", "Temporarily take the site offline")}
        </p>
      </div>

      {form.enabled && (
        <Card className="border-warning-500 bg-warning-50 dark:bg-warning-100/30">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-6 w-6 shrink-0 text-warning-700" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-warning-700">
                  {t("রক্ষণাবেক্ষণ মোড চালু", "Maintenance mode is ON")}
                </span>
                <Badge variant="warning">LIVE</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-700 dark:text-ink-900">
                {t(
                  "গ্রাহকরা এখন একটি রক্ষণাবেক্ষণ পৃষ্ঠা দেখবেন। অ্যাডমিন অ্যাকাউন্ট থেকে প্রবেশ সম্ভব।",
                  "Customers currently see a maintenance page. Admin access still works.",
                )}
              </p>
              {form.message && (
                <div className="mt-2 rounded bg-white p-2 text-sm dark:bg-ink-50">
                  {form.message}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <Wrench className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle>{t("রক্ষণাবেক্ষণ কনফিগারেশন", "Maintenance Configuration")}</CardTitle>
            <CardDescription>
              {t("রক্ষণাবেক্ষণ মোড চালু করুন এবং গ্রাহকদের জন্য একটি বার্তা দেখান", "Enable maintenance mode and show a message to customers")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-ink-200 p-3 dark:border-ink-300">
            <div>
              <div className="font-medium text-ink-900 dark:text-ink-900">
                {t("রক্ষণাবেক্ষণ মোড সক্রিয়", "Enable maintenance mode")}
              </div>
              <div className="text-xs text-ink-500">
                {t("সাইট অফলাইনে নিয়ে যান", "Take the site offline")}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="h-5 w-5 rounded border-ink-300 text-primary-700"
              />
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("বার্তা (গ্রাহকদের জন্য)", "Message (for customers)")}
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              placeholder={t("আমরা সাময়িকভাবে রক্ষণাবেক্ষণে আছি...", "We're under maintenance, please check back soon...")}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("শুরু হবে", "Starts at")}
              </label>
              <Input
                type="datetime-local"
                value={form.startsAt ? form.startsAt.slice(0, 16) : ""}
                onChange={(e) =>
                  setForm({ ...form, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("শেষ হবে", "Ends at")}
              </label>
              <Input
                type="datetime-local"
                value={form.endsAt ? form.endsAt.slice(0, 16) : ""}
                onChange={(e) =>
                  setForm({ ...form, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              <Save className="h-4 w-4" />
              {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}