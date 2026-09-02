import { SiteHeader, SiteCategoryNav } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { MaintenanceBanner } from "@/components/public/maintenance-banner";
import { NoticeStrip } from "@/components/public/notice-strip";
import { SupportFab } from "@/components/public/support-fab";
import { AuthProvider } from "@/lib/auth";

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
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col bg-ink-50 dark:bg-ink-900">
        {/* Maintenance banner — shown only when admin toggles maintenance mode */}
        <MaintenanceBanner />
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
