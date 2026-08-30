import type { Config } from "tailwindcss";

/**
 * XovenMart — Tailwind theme
 * Single source of truth for Web (Public site) + Admin panel
 * All values mirror tech/DESIGN_SYSTEM.md
 */

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: ["class"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1200px",
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Brand primary — Navy
        primary: {
          DEFAULT: "#1B2A5E",
          50: "#F4F6FB",
          100: "#E5E9F5",
          200: "#C7D0E8",
          300: "#9DAED4",
          400: "#5C75B6",
          500: "#3B4F8E",
          600: "#2A3B72",
          700: "#1B2A5E",
          800: "#15214A",
          900: "#0F1A3D",
          950: "#080F26",
        },
        // Brand accent — Energy orange
        accent: {
          DEFAULT: "#F26B1F",
          50: "#FFF4EC",
          100: "#FFE5D5",
          200: "#FFC9A8",
          300: "#FFB687",
          400: "#FF9648",
          500: "#F26B1F",
          600: "#DA5812",
          700: "#C25315",
          800: "#963F12",
          900: "#7A3413",
        },
        // Semantic
        success: {
          DEFAULT: "#16A34A",
          50: "#F0FDF4",
          100: "#DCFCE7",
          500: "#16A34A",
          700: "#15803D",
        },
        warning: {
          DEFAULT: "#F59E0B",
          50: "#FFFBEB",
          100: "#FEF3C7",
          500: "#F59E0B",
          700: "#B45309",
        },
        danger: {
          DEFAULT: "#DC2626",
          50: "#FEF2F2",
          100: "#FEE2E2",
          500: "#DC2626",
          700: "#B91C1C",
        },
        info: {
          DEFAULT: "#0EA5E9",
          50: "#F0F9FF",
          100: "#E0F2FE",
          500: "#0EA5E9",
          700: "#0369A1",
        },
        // Neutrals (slate-tinted) — referenced via CSS variables so the
        // colors re-evaluate at runtime when `.dark` is added to <html>.
        // Without this, Tailwind compiles hardcoded RGB values into both
        // `.bg-ink-100` and `.dark\:bg-ink-100`, leaving dark mode broken.
        ink: {
          50: "var(--xm-ink-50)",
          100: "var(--xm-ink-100)",
          200: "var(--xm-ink-200)",
          300: "var(--xm-ink-300)",
          400: "var(--xm-ink-400)",
          500: "var(--xm-ink-500)",
          700: "var(--xm-ink-700)",
          900: "var(--xm-ink-900)",
        },
      },
      fontFamily: {
        latin: ["var(--font-inter)", "system-ui", "sans-serif"],
        bangla: ["var(--font-hind-siliguri)", "Noto Sans Bengali", "Kalpurush", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display": ["36px", { lineHeight: "44px", fontWeight: "700" }],
        "h1": ["28px", { lineHeight: "36px", fontWeight: "700" }],
        "h2": ["22px", { lineHeight: "30px", fontWeight: "600" }],
        "h3": ["18px", { lineHeight: "26px", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body": ["14px", { lineHeight: "22px", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "20px", fontWeight: "400" }],
        "caption": ["12px", { lineHeight: "16px", fontWeight: "500" }],
        "overline": ["11px", { lineHeight: "14px", fontWeight: "600", letterSpacing: "0.05em" }],
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
      },
      borderRadius: {
        "sm": "6px",
        "md": "10px",
        "lg": "14px",
        "xl": "20px",
        "2xl": "28px",
      },
      boxShadow: {
        "xs": "0 1px 2px rgba(15, 23, 42, 0.04)",
        "sm": "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        "md": "0 4px 12px rgba(15, 23, 42, 0.08), 0 2px 4px rgba(15, 23, 42, 0.04)",
        "lg": "0 12px 32px rgba(15, 23, 42, 0.10), 0 4px 8px rgba(15, 23, 42, 0.04)",
        "accent": "0 8px 24px rgba(242, 107, 31, 0.25)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        "shimmer": "shimmer 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
