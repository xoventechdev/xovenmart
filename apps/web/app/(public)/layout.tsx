"use client";

import { SiteHeader, SiteCategoryNav } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { MaintenanceLock } from "@/components/public/maintenance-lock";
import { NoticeStrip } from "@/components/public/notice-strip";
import { SupportFab } from "@/components/public/support-fab";
import { AuthProvider } from "@/lib/auth";
import { useMaintenance } from "@/lib/use-maintenance";

// All pages under (public) depend on runtime auth + client-side state
// (cart, locale, theme). Force dynamic rendering globally so Next 15
// never tries to statically prerender them in CI (where there's no API
// at localhost:3001). Individual pages can still override with their
// own `export const dynamic` if they want different behavior.
export const dynamic = "force-dynamic";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { enabled, isLoading } = useMaintenance();

  // Short-circuit: when maintenance is on and we know it, render ONLY
  // the lock — no header, notice strip, footer, support fab. The admin
  // can still flip the toggle back off from /admin/system/maintenance
  // because the admin layout is a separate tree and isn't gated here.
  //
  // While the query is loading we render the normal chrome so we never
  // flash an empty page to a visitor whose first paint raced the API.
  if (!isLoading && enabled) {
    return (
      <AuthProvider>
        <MaintenanceLock />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col bg-ink-50 dark:bg-ink-900">
        {/* Site-wide notice strip — admin-editable marquee/alert messages.
            Renders nothing when there are no active notices. */}
        <NoticeStrip />

        {/* Header */}
        <header className="sticky top-0 z-50 bg-white dark:bg-ink-900 border-b border-ink-200 dark:border-ink-800">
          <SiteHeader />
          <SiteCategoryNav />
        </header>

        {/* Main content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <SiteFooter />
      </div>

      {/* Floating support widget — call + WhatsApp, rendered above every
          public route via the layout-level mount. Stays out of admin
          because admin uses a separate layout tree. */}
      <SupportFab />
    </AuthProvider>
  );
}
