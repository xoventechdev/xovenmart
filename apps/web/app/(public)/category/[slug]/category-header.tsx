"use client";

import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { pickName } from "@/lib/locale-text";

/**
 * Localized breadcrumb + h1 for the category page. Pulls the correct
 * nameBn/nameEn based on the live `useTheme().lang` toggle.
 */
export function CategoryHeader({
  slug,
  category,
}: {
  slug: string;
  category: { nameBn?: string; nameEn?: string };
}) {
  const { lang } = useTheme();
  const name = pickName(category, lang);
  const homeBn = "হোম";
  const homeEn = "Home";

  return (
    <>
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
        <Link href="/" className="hover:text-primary">
          {lang === "en" ? homeEn : homeBn}
        </Link>
        <span>/</span>
        <span className="text-foreground">{name || slug}</span>
      </nav>

      {/* Category header */}
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">
          {name || slug}
        </h1>
        {category.nameEn && category.nameBn && (
          <p className="text-sm text-muted-foreground">
            {lang === "en" ? category.nameBn : category.nameEn}
          </p>
        )}
      </div>
    </>
  );
}