"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  MapPin,
  Package,
  User as UserIcon,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

/**
 * Header user menu:
 *   - logged-out → user icon button that links to /login
 *   - logged-in  → initials avatar button that opens a dropdown with
 *                  the user's name, phone, quick links (account,
 *                  addresses, orders) and a logout button
 *
 * Uses a small click-outside handler instead of the shadcn DropdownMenu
 * primitive to avoid pulling in @radix-ui/react-dropdown-menu for this
 * single-purpose menu.
 */
export function UserMenu({ className }: { className?: string }) {
  const auth = useAuth();
  const { lang } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (auth.isLoading) {
    return (
      <button
        disabled
        aria-label={t("লোড হচ্ছে", "Loading")}
        className={
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-500 " +
          (className ?? "")
        }
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </button>
    );
  }

  // ── Logged-out state ──────────────────────────────────────────
  if (!auth.isAuthenticated || !auth.user) {
    return (
      <Link
        href="/login"
        aria-label={t("লগইন", "Log in")}
        className={
          "inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50 " +
          (className ?? "")
        }
      >
        <UserIcon className="h-4 w-4" />
      </Link>
    );
  }

  const initials = makeInitials(auth.user.name);

  // ── Logged-in state ───────────────────────────────────────────
  return (
    <div ref={ref} className={"relative " + (className ?? "")}>
      <button
        type="button"
        aria-label={t("অ্যাকাউন্ট", "Account")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {initials || <UserIcon className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg dark:border-ink-300 dark:bg-ink-100"
        >
          <div className="border-b border-ink-200 px-3 py-2 dark:border-ink-300">
            <div className="truncate text-sm font-semibold text-ink-900 dark:text-ink-900">
              {auth.user.name}
            </div>
            <div className="truncate text-xs text-ink-500 dark:text-ink-500">
              {auth.user.phone}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => navigate("/account")}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50"
          >
            <UserIcon className="h-4 w-4" />
            {t("আমার অ্যাকাউন্ট", "My account")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => navigate("/account/addresses")}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50"
          >
            <MapPin className="h-4 w-4" />
            {t("আমার ঠিকানা", "My addresses")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => navigate("/account/orders")}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50"
          >
            <Package className="h-4 w-4" />
            {t("আমার অর্ডার", "My orders")}
          </button>
          <div className="border-t border-ink-200 dark:border-ink-300">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50"
              onClick={async () => {
                setOpen(false);
                await auth.logout();
                window.location.href = "/";
              }}
            >
              <LogOut className="h-4 w-4" />
              {t("লগআউট", "Logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function makeInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}