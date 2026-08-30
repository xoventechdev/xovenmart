import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBDT(amount: number | string, withSymbol = true): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!isFinite(n)) return withSymbol ? "৳0" : "0";
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
  return withSymbol ? `৳${formatted}` : formatted;
}

export function formatPhone(phone: string): string {
  // 01720694513 → 01720-694-513
  if (phone.length === 11) {
    return `${phone.slice(0, 5)}-${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

export function formatDate(d: Date | string, lang: "bn" | "en" = "bn"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (lang === "bn") {
    // Bengali months
    const monthsBn = ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্ট", "অক্টো", "নভে", "ডিসে"];
    return `${date.getDate()} ${monthsBn[date.getMonth()]} ${date.getFullYear()}`;
  }
  return date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string, lang: "bn" | "en" = "bn"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${formatDate(date, lang)} ${date.toLocaleTimeString(lang === "bn" ? "en-US" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function relativeTime(d: Date | string | null | undefined, lang: "bn" | "en" = "bn"): string {
  // Guard against undefined / null / empty string / invalid dates.
  // Without this, `new Date(undefined).getTime()` returns NaN and Math.floor(NaN/86400) = NaN,
  // which crashes the surrounding render.
  if (d === null || d === undefined || d === "") {
    return lang === "bn" ? "—" : "—";
  }
  const date = typeof d === "string" ? new Date(d) : d;
  const ts = date instanceof Date && !isNaN(date.getTime()) ? date.getTime() : NaN;
  if (!isFinite(ts)) {
    return lang === "bn" ? "—" : "—";
  }
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return lang === "bn" ? "এইমাত্র" : "just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return lang === "bn" ? `${m} মিনিট আগে` : `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return lang === "bn" ? `${h} ঘণ্টা আগে` : `${h}h ago`;
  }
  const days = Math.floor(diff / 86400);
  return lang === "bn" ? `${days} দিন আগে` : `${days}d ago`;
}

/** BD phone validation */
export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;
