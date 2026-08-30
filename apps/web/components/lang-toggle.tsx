"use client";

import { Languages } from "lucide-react";
import { useTheme } from "@/lib/theme";

/**
 * Language toggle — switches between Bangla (default) and English.
 */
export function LangToggle({ className }: { className?: string }) {
  const { lang, toggleLang } = useTheme();
  const next = lang === "bn" ? "EN" : "বাং";

  return (
    <button
      type="button"
      onClick={toggleLang}
      title={lang === "bn" ? "Switch to English" : "বাংলায় পরিবর্তন করুন"}
      className={
        "inline-flex h-10 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50 dark:hover:bg-ink-700 dark:hover:text-white " +
        (className ?? "")
      }
    >
      <Languages className="h-4 w-4" />
      <span>{next}</span>
    </button>
  );
}