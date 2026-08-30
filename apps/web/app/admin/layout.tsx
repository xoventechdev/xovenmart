"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ShieldAlert, Loader2 } from "lucide-react";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { AdminTopBar } from "@/components/admin/top-bar";
import { api } from "@/lib/api";

/**
 * Admin layout — CLIENT COMPONENT.
 *
 * Renders NOTHING (just a loader) until it has verified that the user has
 * a valid admin session in localStorage. This guarantees the sidebar
 * and top-bar NEVER appear in the DOM for unauthenticated visitors,
 * even during SSR/hydration race conditions.
 *
 * The login page (`/admin/login`) is exempted because it is the only
 * admin route that should render for anonymous users.
 *
 * Backend protection: API requests still go through NestJS `AuthGuard`
 * + `RolesGuard` so data is never exposed regardless of client UI.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<
    "checking" | "ok" | "redirecting" | "wrong-audience"
  >("checking");

  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) {
      setState("ok");
      return;
    }

    const authed = api.isAuthenticated();
    const audience = api.getAudience();

    if (!authed) {
      setState("redirecting");
      router.replace("/admin/login");
      return;
    }

    if (audience !== "admin") {
      setState("wrong-audience");
      api.clearTokens();
      router.replace("/admin/login");
      return;
    }

    setState("ok");
  }, [isLogin, router, pathname]);

  // Login page is allowed through immediately.
  if (isLogin) {
    return <>{children}</>;
  }

  // Until the auth check completes (or fails), show ONLY the loader.
  // The sidebar/topbar/main children are NEVER rendered in this state.
  if (state !== "ok") {
    if (state === "wrong-audience") {
      return (
        <div suppressHydrationWarning className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-900">
          <div suppressHydrationWarning className="max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-sm dark:border-ink-300 dark:bg-ink-100">
            <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-danger-500" />
            <h1 className="text-xl font-bold text-ink-900 dark:text-ink-50">
              অ্যাক্সেস নিষিদ্ধ
            </h1>
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-300">
              আপনি অ্যাডমিন অ্যাকাউন্টে লগইন করেননি। লগইন পেজে নিয়ে যাওয়া হচ্ছে...
            </p>
          </div>
        </div>
      );
    }

    return (
      <div suppressHydrationWarning className="flex min-h-screen items-center justify-center bg-ink-50 dark:bg-ink-900">
        <div suppressHydrationWarning className="flex flex-col items-center gap-3 text-ink-500 dark:text-ink-300">
          <Loader2 className="h-8 w-8 animate-spin text-primary-700 dark:text-primary-500" />
          <p className="text-sm">লগইন যাচাই হচ্ছে...</p>
        </div>
      </div>
    );
  }

  // Auth verified — render the protected UI.
  return (
    <div className="flex min-h-screen bg-ink-50 text-ink-900 dark:bg-ink-900 dark:text-ink-50">
      <SidebarNav />
      <div className="flex flex-1 flex-col">
        <AdminTopBar />
        <main className="flex-1 overflow-x-hidden bg-ink-50 p-4 text-ink-900 dark:bg-ink-900 dark:text-ink-50 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}