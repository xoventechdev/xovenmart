"use client";

import { HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTwin } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

/**
 * Public FAQ view. Renders every published FAQ grouped by category.
 *
 * Data source: `GET /api/v1/faqs/public?category=...`
 *
 *   - The hardcoded 10-item array that previously lived here has been
 *     removed. Every FAQ the customer sees is now a row in the `Faq`
 *     table, so any admin edit at `/admin/public-site/faq` is reflected
 *     here on the next page load (TanStack Query has a short
 *     staleTime so admin updates feel instant during testing).
 *   - The endpoint filters `isPublished = true` server-side — drafts
 *     never reach customers, even if the admin forgot to uncheck the
 *     box.
 *   - Category headings are localised by a small built-in map so an
 *     admin who invents a new category still gets a readable label
 *     (it falls back to the raw slug).
 */

interface ApiFaq {
  id: string;
  category: string;
  questionBn: string;
  questionEn: string;
  answerBn: string;
  answerEn: string;
  isPublished: boolean;
  sortOrder: number;
}

interface FaqGroup {
  /** Slug — used as React key. */
  category: string;
  /** Display label, picked from the bilingual map (falls back to the slug). */
  label: string;
  items: ApiFaq[];
}

/**
 * Translate the category slug into a readable label in the active language.
 * Falls back to the raw slug so a new category the admin just invented
 * still renders something readable instead of `undefined`.
 */
const CATEGORY_LABEL: Record<string, { bn: string; en: string }> = {
  ordering: { bn: "অর্ডার", en: "Ordering" },
  delivery: { bn: "ডেলিভারি", en: "Delivery" },
  payment: { bn: "পেমেন্ট", en: "Payment" },
  returns: { bn: "রিটার্ন ও রিফান্ড", en: "Returns & Refunds" },
  general: { bn: "সাধারণ", en: "General" },
};

function categoryLabel(slug: string, lang: "bn" | "en"): string {
  return CATEGORY_LABEL[slug]?.[lang] ?? slug;
}

/**
 * Thin wrapper around `useTheme()` that returns a safe default if the
 * I18nProvider hasn't mounted yet (e.g. during the first paint before
 * client hydration finishes). Keeps the existing behaviour of the page
 * even when the theme context is unavailable.
 */
function useThemeSafe() {
  try {
    return useTheme();
  } catch {
    return { lang: "bn" as const };
  }
}

export function FaqView() {
  const { lang } = useThemeSafe();
  const tw = useTwin();

  // Fetch every published FAQ. The endpoint is unauthenticated and
  // returns a flat array. We group client-side by category because the
  // admin adds new categories on the fly and the public page should pick
  // them up without a redeploy.
  const { data, isLoading, isError } = useQuery<ApiFaq[]>({
    queryKey: ["public", "faqs"],
    queryFn: () => api.get("/faqs/public"),
    // Short staleTime so admin edits during testing show up after a
    // refresh without an explicit invalidation. 60 s is the same window
    // we use for `useFeatureToggles` / `useDeliveryPublicSafe`.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Group + sort. Server already returns rows in (sortOrder ASC, createdAt
  // ASC) order; the group step preserves that order within each bucket.
  const faqs: ApiFaq[] = Array.isArray(data) ? data : [];
  const groups: FaqGroup[] = (() => {
    const map = new Map<string, ApiFaq[]>();
    for (const f of faqs) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return Array.from(map.entries()).map(([category, items]) => ({
      category,
      label: categoryLabel(category, lang),
      items,
    }));
  })();

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-8">
        <HelpCircle className="h-10 w-10 text-primary mx-auto mb-2" />
        <h1 className="text-3xl font-bold">{tw("প্রশ্নোত্তর", "FAQ")}</h1>
        <p className="text-muted-foreground mt-1">
          {tw("সাধারণ জিজ্ঞাসা ও উত্তর", "Common questions and answers")}
        </p>
      </div>

      {/* Loading — same skeleton pattern as the rest of the public site. */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-ink-100 dark:bg-ink-800"
            />
          ))}
        </div>
      )}

      {/* Error — keep the page usable instead of throwing. The fallback
          copy tells the user the page is offline (it usually means the
          API is down, not that there are no FAQs). */}
      {isError && !isLoading && (
        <div className="rounded-xl border border-ink-200 bg-white p-6 text-center text-sm text-muted-foreground dark:border-ink-800 dark:bg-ink-900">
          {tw(
            "প্রশ্নোত্তর এই মুহূর্তে লোড করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
            "We're having trouble loading the FAQs right now. Please try again in a moment.",
          )}
        </div>
      )}

      {/* Empty state — only when the API succeeded but the admin hasn't
          added any published FAQs yet. */}
      {!isLoading && !isError && groups.length === 0 && (
        <div className="rounded-xl border border-ink-200 bg-white p-6 text-center text-sm text-muted-foreground dark:border-ink-800 dark:bg-ink-900">
          {tw(
            "এখনও কোন প্রশ্নোত্তর যোগ করা হয়নি।",
            "No FAQs have been added yet.",
          )}
        </div>
      )}

      {/* Grouped list — one heading per category, then <details> rows. */}
      {groups.map((g) => (
        <section key={g.category} className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </h2>
          <div className="space-y-3">
            {g.items.map((item) => (
              <details
                key={item.id}
                className="group bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4"
              >
                <summary className="flex items-center justify-between cursor-pointer font-semibold list-none">
                  <span>{lang === "en" ? item.questionEn : item.questionBn}</span>
                  <span className="text-primary text-2xl leading-none group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed whitespace-pre-line">
                  {lang === "en" ? item.answerEn : item.answerBn}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-10 p-6 bg-primary/5 border border-primary/20 rounded-xl text-center">
        <p className="font-semibold mb-1">
          {tw("আরও প্রশ্ন আছে?", "Still have questions?")}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          {tw("আমাদের সাথে সরাসরি যোগাযোগ করুন", "Reach out to us directly")}
        </p>
        <a
          href="/contact"
          className="inline-block px-5 py-2 bg-primary text-white rounded-lg font-semibold hover:opacity-90"
        >
          {tw("যোগাযোগ পেজ", "Contact page")}
        </a>
      </div>
    </div>
  );
}
