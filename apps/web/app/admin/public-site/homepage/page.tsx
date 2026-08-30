"use client";

import { useTheme } from "@/lib/theme";
import { Placeholder } from "@/components/admin/placeholder";

export default function HomepageBannersPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <Placeholder
      titleBn="হোমপেজ ব্যানার"
      titleEn="Homepage Banners"
      descBn="হোমপেজের হিরো ব্যানার ও সেকশনগুলো কনফিগার করুন"
      descEn="Configure homepage hero banners & sections"
      t={t}
    />
  );
}
