"use client";
import { Placeholder } from "@/components/admin/placeholder";
import { useTheme } from "@/lib/theme";
export default function AboutPageEditor() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return <Placeholder titleBn="আমাদের সম্পর্কে" titleEn="About Page" descBn="/about পেজের কন্টেন্ট এডিট করুন" descEn="Edit content of the /about page" t={t} />;
}
