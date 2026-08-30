"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark" | "system";
type Lang = "bn" | "en";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleTheme: () => void;
  toggleLang: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

const STORAGE_THEME = "xm-theme";
const STORAGE_LANG = "xm-lang";

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
    // Used by globals.css overrides — see comment block there.
    // Tailwind's compiled `.dark\:bg-ink-100` rules contain hardcoded
    // hex values, so we re-bind via CSS variable at runtime.
    root.setAttribute("data-xm-dark", "true");
  } else {
    root.classList.remove("dark");
    root.removeAttribute("data-xm-dark");
  }
}

function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
}

function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  return t;
}

export function ThemeProvider({ children, defaultTheme = "light", defaultLang = "bn" }: { children: ReactNode; defaultTheme?: Theme; defaultLang?: Lang }) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(resolveTheme(defaultTheme));
  const [lang, setLangState] = useState<Lang>(defaultLang);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const t = (localStorage.getItem(STORAGE_THEME) as Theme | null) ?? defaultTheme;
    const l = (localStorage.getItem(STORAGE_LANG) as Lang | null) ?? defaultLang;
    setThemeState(t);
    setLangState(l);
    const rt = resolveTheme(t);
    setResolvedTheme(rt);
    applyTheme(rt);
    applyLang(l);
  }, [defaultTheme, defaultLang]);

  // Listen to system theme changes when set to "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const cb = () => {
      const rt = resolveTheme("system");
      setResolvedTheme(rt);
      applyTheme(rt);
    };
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_THEME, t);
    const rt = resolveTheme(t);
    setResolvedTheme(rt);
    applyTheme(rt);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_LANG, l);
    applyLang(l);
    // Notify Bangla / English UI consumers
    window.dispatchEvent(new CustomEvent("xm-lang-change", { detail: l }));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  }, [resolvedTheme, setTheme]);

  const toggleLang = useCallback(() => {
    setLang(lang === "bn" ? "en" : "bn");
  }, [lang, setLang]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, lang, setLang, toggleTheme, toggleLang }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/**
 * Inline-script prevention of flash of unstyled theme (FART).
 * Inject this in <head> BEFORE React hydrates, so users never see wrong theme.
 */
export const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('${STORAGE_THEME}') || 'system';
    var l = localStorage.getItem('${STORAGE_LANG}') || 'bn';
    var rt = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t;
    if (rt === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-xm-dark', 'true');
    }
    document.documentElement.lang = l;
  } catch(e){}
})();
`;