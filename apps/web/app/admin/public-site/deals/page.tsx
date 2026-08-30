"use client";
import { Placeholder } from "@/components/admin/placeholder";
import { useTheme } from "@/lib/theme";
export default function DealsConfigPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return <Placeholder titleBn="ডিল পেজ কনফিগারেশন" titleEn="Deals Page Configuration" descBn="ডিল পেজে কোন কোন ক্যাটাগরি/পণ্য দেখাবে কনফিগার করুন" descEn="Configure which categories/products show on the deals page" t={t} />;
}
