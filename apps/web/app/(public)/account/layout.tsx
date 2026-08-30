"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogIn, MapPin, Package, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";

/**
 * Shared layout for the logged-in customer's account area.
 *
 *  - Renders a left-side tab nav (Profile / Addresses / Orders).
 *  - Shows the user's avatar + name at the top so identity is always
 *    visible, even on sub-pages.
 *  - Bounces unauthenticated visitors to /login?next=<current path>.
 *
 * Each tab uses `usePathname()` for active styling so we don't need to
 * pass `selected` props down.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { lang } = useTheme();

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // Auth guard: while loading, render nothing; once loaded, if not
  // authenticated, send the user to /login with a `next=` redirect back.
  useEffect(() => {
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/account")}`);
    }
  }, [auth.isLoading, auth.isAuthenticated, pathname, router]);

  if (auth.isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="h-8 w-32 animate-pulse rounded bg-ink-200 dark:bg-ink-800" />
      </div>
    );
  }

  if (!auth.isAuthenticated || !auth.user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <LogIn className="mx-auto mb-4 h-10 w-10 text-ink-400" />
        <p className="mb-4 text-ink-700 dark:text-ink-50">
          {t("অ্যাকাউন্ট দেখতে লগইন করুন", "Please log in to view your account")}
        </p>
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent(pathname || "/account")}`}>
            {t("লগইন করুন", "Log in")}
          </Link>
        </Button>
      </div>
    );
  }

  const tabs = [
    { href: "/account", labelBn: "প্রোফাইল", labelEn: "Profile", Icon: User, exact: true },
    {
      href: "/account/addresses",
      labelBn: "ঠিকানা",
      labelEn: "Addresses",
      Icon: MapPin,
    },
    {
      href: "/account/orders",
      labelBn: "অর্ডারসমূহ",
      labelEn: "Orders",
      Icon: Package,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("আমার অ্যাকাউন্ট", "My account")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {auth.user.name} · {auth.user.phone}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-32 md:self-start">
          <nav className="flex gap-2 overflow-x-auto rounded-lg border border-ink-200 bg-white p-2 dark:border-ink-300 dark:bg-ink-100 md:flex-col md:overflow-visible">
            {tabs.map((tab) => {
              const active = tab.exact
                ? pathname === tab.href
                : pathname?.startsWith(tab.href);
              const Icon = tab.Icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition whitespace-nowrap " +
                    (active
                      ? "bg-primary text-white"
                      : "text-ink-700 hover:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(tab.labelBn, tab.labelEn)}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
