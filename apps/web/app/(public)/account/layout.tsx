"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogIn, MapPin, Package, User, Gift } from "lucide-react";
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
    {
      href: "/account/referrals",
      labelBn: "রেফারেল",
      labelEn: "Referrals",
      Icon: Gift,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl font-bold text-ink-900 dark:text-ink-900 sm:text-2xl">
          {t("আমার অ্যাকাউন্ট", "My account")}
        </h1>
        <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
          {auth.user.name} · {auth.user.phone}
        </p>
      </div>

      <div className="grid gap-4 md:gap-6 md:grid-cols-[220px_1fr]">
        {/*
          `min-w-0` on the <aside> is critical — by default, grid items
          have `min-width: auto`, which means they refuse to shrink
          below their content size. Without this the inner
          `<nav overflow-x-auto>` would force the aside to grow to the
          full width of all 4 tabs (~400px+) on mobile, blowing the
          page out to horizontal scroll. With `min-w-0`, the aside
          collapses to the viewport width and the nav's `overflow-x-auto`
          actually clips so users scroll *inside* the strip instead of
          the whole page scrolling sideways.
        */}
        <aside className="min-w-0 md:sticky md:top-32 md:self-start">
          {/* Mobile: horizontal scrollable tab strip (sits edge-to-edge
              via -mx-4 + px-4 so it visually spans the container).
              Desktop (md+): vertical sidebar (border + rounded corners
              + bg). */}
          <nav
            className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:overflow-visible md:rounded-lg md:border md:border-ink-200 md:bg-white md:p-2 md:dark:border-ink-300 md:dark:bg-ink-100"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
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
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition whitespace-nowrap " +
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
