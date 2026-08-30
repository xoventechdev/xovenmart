import { SiteHeader, SiteCategoryNav } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { AuthProvider } from "@/lib/auth";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col bg-ink-50 dark:bg-ink-900">
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
    </AuthProvider>
  );
}
