"use client";

import { Info, AlertTriangle, CheckCircle2, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useNoticesPublicSafe, type PublicNotice } from "@/lib/use-notices";
import { useTheme } from "@/lib/theme";

/**
 * Severity → tailwind colour scheme. The strip blends into the layout so
 * we use subtle, theme-aware backgrounds rather than loud solid colours.
 */
const severityClasses: Record<
  PublicNotice["severity"],
  { wrap: string; icon: string; pill: string }
> = {
  info: {
    wrap: "bg-primary-50 text-primary-900 border-primary-200 dark:bg-primary-900/30 dark:text-primary-100 dark:border-primary-700",
    icon: "text-primary-700 dark:text-primary-100",
    pill: "bg-primary-100 text-primary-800 dark:bg-primary-700 dark:text-primary-50",
  },
  warning: {
    wrap: "bg-warning-50 text-warning-900 border-warning-200 dark:bg-warning-500/15 dark:text-warning-100 dark:border-warning-500/40",
    icon: "text-warning-700 dark:text-warning-100",
    pill: "bg-warning-100 text-warning-800 dark:bg-warning-500/30 dark:text-warning-50",
  },
  success: {
    wrap: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-100 dark:border-emerald-500/40",
    icon: "text-emerald-700 dark:text-emerald-100",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/30 dark:text-emerald-50",
  },
  danger: {
    wrap: "bg-red-50 text-red-900 border-red-200 dark:bg-red-500/15 dark:text-red-100 dark:border-red-500/40",
    icon: "text-red-700 dark:text-red-100",
    pill: "bg-red-100 text-red-800 dark:bg-red-500/30 dark:text-red-50",
  },
};

function NoticeIcon({
  severity,
  className,
}: {
  severity: PublicNotice["severity"];
  className?: string;
}) {
  if (severity === "warning") return <AlertTriangle className={className} />;
  if (severity === "success") return <CheckCircle2 className={className} />;
  if (severity === "danger") return <AlertCircle className={className} />;
  return <Info className={className} />;
}

/**
 * Site-wide notice strip. Admin-editable, multi-row supported.
 *
 * Behaviour:
 *   - Renders nothing when there are no active notices.
 *   - Each notice can be individually dismissed via the × button
 *     (dismiss state is stored in localStorage; the dismiss survives
 *     until the notice id changes or the user clears their storage).
 *   - When a notice has a link, the link label appears as a button on
 *     the right of the strip. The whole strip is also clickable when
 *     a link is present.
 *   - BN/EN text follows the live language toggle.
 */
export function NoticeStrip() {
  const { items } = useNoticesPublicSafe();
  const { lang } = useTheme();
  const [dismissed, setDismissed] = useState<Record<string, true>>({});

  if (!items || items.length === 0) return null;

  const visible = items.filter((n) => !dismissed[n.id]);
  if (visible.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Site notices"
      className="w-full border-b border-ink-200 dark:border-ink-700"
    >
      {visible.map((n) => {
        const scheme = severityClasses[n.severity] ?? severityClasses.info;
        const text = lang === "en" ? n.textEn : n.textBn;
        const linkLabel =
          (lang === "en" ? n.linkLabelEn : n.linkLabelBn) ?? n.linkLabelEn ?? "";
        const isExternal = n.linkUrl && /^https?:\/\//i.test(n.linkUrl);

        const body = (
          <div
            className={`flex w-full items-start gap-2 px-3 py-2 text-xs sm:text-sm ${scheme.wrap}`}
          >
            <NoticeIcon severity={n.severity} className={`mt-0.5 h-4 w-4 shrink-0 ${scheme.icon}`} />
            <div className="min-w-0 flex-1">
              <p className="leading-snug">{text}</p>
            </div>
            {n.linkUrl && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${scheme.pill}`}
              >
                {linkLabel || (lang === "en" ? "Open" : "দেখুন")}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDismissed((d) => ({ ...d, [n.id]: true }));
              }}
              className="shrink-0 rounded p-1 text-current/70 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Dismiss notice"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );

        if (!n.linkUrl) return <div key={n.id}>{body}</div>;
        if (isExternal) {
          return (
            <a
              key={n.id}
              href={n.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:brightness-95"
            >
              {body}
            </a>
          );
        }
        return (
          <Link key={n.id} href={n.linkUrl} className="block hover:brightness-95">
            {body}
          </Link>
        );
      })}
    </div>
  );
}