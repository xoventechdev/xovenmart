"use client";
import { useTheme } from "@/lib/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NewDeliveryZonePage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
        {t("নতুন ডেলিভারি জোন", "Add Delivery Zone")}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t(
              '"ডেলিভারি জোন" পেজে গিয়ে "+ নতুন জোন" বোতামে ক্লিক করুন',
              'Use the "+ Add Zone" button on the Delivery Zones page',
            )}
          </CardTitle>
          <CardDescription>
            {t(
              "নতুন জোন যোগ করতে সেখানকার মডাল ব্যবহার করুন।",
              "Add new zones via the modal on the Delivery Zones page.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/delivery-zones"
            className="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline"
          >
            {t("ডেলিভারি জোন পেজে যান", "Go to Delivery Zones")} <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}