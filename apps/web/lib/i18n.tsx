"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useTheme } from "@/lib/theme";

type Locale = "bn" | "en";

interface I18nCtx {
  /** Current locale. Mirrors `useTheme().lang` so the two stay in sync. */
  locale: Locale;
  /** Programmatic switch. Persists to localStorage and re-fetches bundle. */
  setLocale: (l: Locale) => void;
  /** Resolve a translation key. Falls back to `fallback`, then to `key`. */
  t: (key: string, fallback?: string) => string;
  /** Force-refresh the in-memory + localStorage bundle for the current locale. */
  refresh: () => Promise<void>;
  /** Clear the localStorage cache entry for the current locale (next mount refetches). */
  invalidate: () => void;
  /** True while the first bundle is being fetched for the current locale. */
  loading: boolean;
}

const I18NContext = createContext<I18nCtx | null>(null);

const STORAGE_LANG = "xm-lang";
const CACHE_KEY = (l: Locale) => `xm-i18n-${l}`;
const CACHE_TTL_MS = 5 * 60_000;
const STORAGE_VERSION = "v1";

// Always resolves to ".../<root>/api/v1" — strips any trailing
// `/api/v\d+` the operator may have included in NEXT_PUBLIC_API_URL so
// we never end up with `/api/v1/api/v1/i18n/bn`.
const _rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const API_URL =
  _rawApiUrl.replace(/\/api\/v\d+\/?$/, "") + "/api/v1";

function readLang(): Locale {
  if (typeof window === "undefined") return "bn";
  const v = localStorage.getItem(STORAGE_LANG);
  return v === "en" ? "en" : "bn";
}

function applyDocumentLang(l: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = l;
  }
}

interface Bundle {
  translations: Record<string, string>;
  fetchedAt: number;
  version: string;
}

function readCachedBundle(l: Locale): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY(l));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Bundle;
    if (parsed.version !== STORAGE_VERSION) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.translations ?? {};
  } catch {
    return null;
  }
}

function writeCachedBundle(l: Locale, translations: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    const payload: Bundle = { translations, fetchedAt: Date.now(), version: STORAGE_VERSION };
    localStorage.setItem(CACHE_KEY(l), JSON.stringify(payload));
  } catch {
    // localStorage might be full or disabled (private mode); ignore.
  }
}

function clearCachedBundle(l: Locale) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY(l));
  } catch {}
}

async function fetchBundle(l: Locale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_URL}/i18n/${l}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { translations?: Record<string, string> };
    return data.translations ?? {};
  } catch {
    // Network error — keep empty bundle, inline t("bn","en") calls act as fallback.
    return {};
  }
}

export function I18nProvider({
  children,
  defaultLocale = "bn",
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [bundle, setBundle] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Hydrate locale from localStorage on mount (mirrors ThemeProvider behavior)
  useEffect(() => {
    const stored = readLang();
    setLocaleState(stored);
    applyDocumentLang(stored);
  }, []);

  // Subscribe to lang changes from ThemeProvider (xm-lang-change event).
  // This keeps the two providers perfectly synchronized.
  useEffect(() => {
    const onLangChange = (e: Event) => {
      const next = (e as CustomEvent<Locale>).detail;
      if (next === "bn" || next === "en") setLocaleState(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_LANG && (e.newValue === "bn" || e.newValue === "en")) {
        setLocaleState(e.newValue);
      }
    };
    window.addEventListener("xm-lang-change", onLangChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("xm-lang-change", onLangChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const loadBundle = useCallback(async (l: Locale, force = false) => {
    // Try cache first
    if (!force) {
      const cached = readCachedBundle(l);
      if (cached) {
        setBundle(cached);
        return;
      }
    }
    setLoading(true);
    const fresh = await fetchBundle(l);
    writeCachedBundle(l, fresh);
    setBundle(fresh);
    setLoading(false);
  }, []);

  // Load bundle whenever locale changes
  useEffect(() => {
    void loadBundle(locale);
    applyDocumentLang(locale);
  }, [locale, loadBundle]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    applyDocumentLang(l);
    // Persist so a hard-refresh / new tab picks up the same language
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_LANG, l);
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      // 1. DB bundle (admin-managed)
      const fromBundle = bundle[key];
      if (typeof fromBundle === "string" && fromBundle.length > 0) return fromBundle;
      // 2. Inline fallback (the existing t("bn","en") pattern)
      if (typeof fallback === "string" && fallback.length > 0) return fallback;
      // 3. Last resort — show the key so devs see what's missing
      return key;
    },
    [bundle],
  );

  const refresh = useCallback(async () => {
    await loadBundle(locale, true);
  }, [locale, loadBundle]);

  const invalidate = useCallback(() => {
    clearCachedBundle(locale);
  }, [locale]);

  const value = useMemo<I18nCtx>(
    () => ({ locale, setLocale, t, refresh, invalidate, loading }),
    [locale, setLocale, t, refresh, invalidate, loading],
  );

  return <I18NContext.Provider value={value}>{children}</I18NContext.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18NContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/**
 * Convenience hook. Returns a `t(key, fallback)` function backed by the
 * DB bundle, plus the existing `useTheme()` API so call sites can keep
 * using `lang`, `setLang`, `toggleLang` exactly as before.
 *
 * Typical usage:
 *   const { t, lang, toggleLang } = useT();
 *   return <button>{t("cart.checkout", "চেকআউট")}</button>
 */
export function useT() {
  const { t, locale, setLocale, refresh, invalidate, loading } = useI18n();
  return { t, lang: locale, setLocale, setLang: setLocale, refresh, invalidate, loading };
}

/**
 * Bilingual inline helper for retrofitting hardcoded strings. Returns the
 * BN or EN string based on the current `useTheme().lang` value. Use this
 * when an existing component has hardcoded text we want to make dynamic
 * without a full DB-key refactor:
 *
 *   const tw = useTwin();
 *   <button>{tw("সংরক্ষণ", "Save")}</button>
 *
 * For brand-new code prefer `useT()` with a key so admins can edit later.
 */
export function useTwin() {
  const { lang } = useTheme();
  return (bn: string, en: string) => (lang === "bn" ? bn : en);
}

/**
 * Convenience component that renders a bilingual inline string.
 * Equivalent to `{useTwin()(bn, en)}` but with a JSX surface:
 *
 *   <T bn="সংরক্ষণ" en="Save" />
 *   <T bn="সংরক্ষণ" en="Save" as="span" className="text-sm" />
 */
export function T({
  bn,
  en,
  as: As = "span",
  ...rest
}: {
  bn: string;
  en: string;
  as?: keyof JSX.IntrinsicElements;
  [key: string]: any;
}) {
  // useTwin is called inside the component body (rules of hooks OK).
  const tw = useTwin();
  return <As {...rest}>{tw(bn, en)}</As>;
}
