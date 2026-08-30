"use client";
import { Placeholder } from "@/components/admin/placeholder";
import { useTheme } from "@/lib/theme";
export default function FooterLinksPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return <Placeholder titleBn="ফুটার লিংক" titleEn="Footer Links" descBn="ফুটারে কোন কোন লিংক ও ক্যাটাগরি দেখাবে কনফিগার করুন" descEn="Configure footer links and categories" t={t} />;
}
