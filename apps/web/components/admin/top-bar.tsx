"use client";

import { Bell, Search, User, ChevronDown, LogOut, Settings as SettingsIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";
import { useTheme } from "@/lib/theme";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

export function AdminTopBar() {
  const { lang } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.setAudience("admin");
    if (!api.isAuthenticated()) {
      if (pathname !== "/admin/login") {
        router.push("/admin/login");
      }
      return;
    }
    api
      .get("/auth/me")
      .then(setMe)
      .catch(() => {
        api.clearTokens();
        router.push("/admin/login");
      });
  }, [router, pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // Title from path
  const title = pathname
    .split("/")
    .filter(Boolean)
    .slice(1)
    .map((s) => s.replace(/-/g, " "))
    .join(" › ");

  const roleLabel =
    me?.admin?.role === "ADMIN"
      ? "👑 Admin"
      : me?.admin?.role === "MANAGER"
      ? "🔧 Manager"
      : me?.admin?.role;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-ink-200 bg-white px-4 shadow-xs dark:border-primary-800 dark:bg-primary-950 md:gap-4 md:px-6">
      {/* Breadcrumb */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink-500">{t("অ্যাডমিন প্যানেল", "Admin Panel")}</div>
        <div className="truncate text-base font-semibold text-ink-900 dark:text-ink-50 capitalize">{title || t("ড্যাশবোর্ড", "Dashboard")}</div>
      </div>

      {/* Search */}
      <div className="hidden items-center gap-2 rounded-md bg-ink-100 px-3 py-1.5 text-sm dark:bg-primary-900 dark:ring-1 dark:ring-primary-800 md:flex">
        <Search className="h-4 w-4 text-ink-400" />
        <input
          type="search"
          placeholder={t("অনুসন্ধান...", "Search...")}
          className="w-40 bg-transparent text-ink-900 placeholder:text-ink-400 focus:outline-none dark:text-ink-50 dark:placeholder:text-primary-300"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <LangToggle />
        <ThemeToggle />
        <button className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-primary-900">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent-500" />
        </button>
        {me && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md bg-ink-100 px-2 py-1 transition-colors hover:bg-ink-200 dark:bg-primary-900 dark:ring-1 dark:ring-primary-800 dark:hover:bg-primary-800"
            >
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${me.admin?.role === "ADMIN" ? "bg-primary-500" : "bg-info-500"}`}>
                {me.admin?.name?.[0] || "A"}
              </div>
              <div className="hidden text-left text-xs lg:block">
                <div className="font-semibold text-ink-900 dark:text-ink-50">{me.admin?.name}</div>
                <div className="text-ink-500 dark:text-primary-300">{roleLabel}</div>
              </div>
              <ChevronDown className={`hidden h-4 w-4 text-ink-400 transition-transform dark:text-primary-300 lg:block ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-md dark:border-primary-800 dark:bg-primary-950">
                <div className="border-b border-ink-200 px-3 py-2 dark:border-primary-800">
                  <div className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {me.admin?.name}
                  </div>
                  <div className="truncate text-xs text-ink-500 dark:text-primary-300">{me.admin?.email}</div>
                </div>
                <div className="py-1">
                  <Link
                    href="/admin/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-primary-900"
                  >
                    <SettingsIcon className="h-4 w-4" />
                    {t("প্রোফাইল ও সেটিংস", "Profile & Settings")}
                  </Link>
                  <button
                    onClick={() => {
                      api.clearTokens();
                      setMenuOpen(false);
                      router.push("/admin/login");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger-700 hover:bg-danger-100 dark:text-danger-100 dark:hover:bg-danger-700/30"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("লগআউট", "Logout")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
