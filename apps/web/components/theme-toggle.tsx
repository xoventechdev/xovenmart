"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/**
 * Theme toggle button — cycles light → dark → light.
 * Bangla-first: aria labels in BN by default; switch with lang toggle.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme, lang } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = lang === "bn"
    ? (isDark ? "লাইট মোড" : "ডার্ক মোড")
    : (isDark ? "Light mode" : "Dark mode");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={
        "inline-flex h-10 w-10 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50 dark:hover:bg-ink-700 dark:hover:text-white " +
        (className ?? "")
      }
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}