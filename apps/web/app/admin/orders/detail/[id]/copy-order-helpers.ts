/**
 * Helpers for the admin order detail "Copy for delivery" button.
 *
 * Builds a clean plaintext block that an admin/manager can paste into
 * WhatsApp to share with the rider or anyone verifying the order. The
 * format mirrors how delivery instructions are usually written in chat —
 * line-by-line, bilingual labels, with a Google Maps link pinned at the
 * lat/lng for one-tap navigation.
 *
 * Format (BN locale example):
 *   অর্ডার #XVM-260905-001
 *   ─────────────────
 *   কাস্টমার: মোঃ কামাল
 *   মোবাইল: ০১৭২০৬৯৪৫১৩
 *   ঠিকানা: বাড়ি ২৩, মধ্যপাড়া, মুড়াফরগঞ্জ
 *   ম্যাপ: https://www.google.com/maps?q=23.7853,91.1153
 *   ─────────────────
 *   পণ্য (৩):
 *   1. চাল ৫ কেজি × ২ = ৳১২০০
 *   2. তেল ১ লিটার × ১ = ৳৳২৫০
 *   মোট: ৳১৪৫০
 *
 * (EN locale labels replace the Bangla strings.)
 *
 * Defensive against missing fields — the formatter always returns a
 * 200-char string even if the order has no address, no phone, or no
 * items. Better to copy *something* than to crash the clipboard call.
 */

import { formatBDT } from "@/lib/utils";

interface OrderLike {
  orderNo?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
  guestName?: string | null;
  guestPhone?: string | null;
  address?: {
    // Legacy shape (pre-uniform-address refactor) — line1/line2/area/city/postcode.
    line1?: string | null;
    line2?: string | null;
    area?: string | null;
    city?: string | null;
    postcode?: string | null;
    // Uniform 2-input shape — fullText is the single free-text address.
    fullText?: string | null;
    landmark?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    label?: string | null;
    type?: string | null;
  } | null;
  items?: Array<{
    nameSnapshot?: string | null;
    unitPrice?: number | string | null;
    qty?: number | null;
    lineTotal?: number | string | null;
  }>;
  grandTotal?: number | string | null;
}

/** Build the Google Maps URL. Falls back to a search-by-place query if
 *  the order has no lat/lng (older addresses without a pin). */
function buildMapsUrl(addr: OrderLike["address"]): string | null {
  if (!addr) return null;
  const lat = addr.lat != null ? Number(addr.lat) : NaN;
  const lng = addr.lng != null ? Number(addr.lng) : NaN;
  if (isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  // Fallback: search by full text / area
  const query = addr.fullText || [addr.line1, addr.line2, addr.area, addr.city]
    .filter(Boolean)
    .join(", ");
  if (!query) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}`;
}

/** Build the address display string. Prefers `fullText` (uniform 2-input
 *  shape), falls back to line1/line2/area/city joined (legacy shape).
 *  Skips empty parts and the `"—"` placeholder that the new uniform
 *  flow sometimes writes into `area`. */
function formatAddress(addr: OrderLike["address"]): string {
  if (!addr) return "";
  if (addr.fullText && addr.fullText.trim() && addr.fullText.trim() !== "—") {
    const landmark = addr.landmark && addr.landmark.trim() ? ` (${addr.landmark.trim()})` : "";
    return `${addr.fullText.trim()}${landmark}`;
  }
  const parts = [addr.line1, addr.line2, addr.area, addr.city, addr.postcode]
    .filter((p) => p != null && String(p).trim() !== "" && String(p).trim() !== "—")
    .map((p) => String(p).trim());
  return parts.join(", ");
}

export function buildOrderCopyText(order: OrderLike, lang: "bn" | "en"): string {
  const L = {
    orderHeader: lang === "bn" ? "অর্ডার" : "Order",
    customer: lang === "bn" ? "কাস্টমার" : "Customer",
    mobile: lang === "bn" ? "মোবাইল" : "Mobile",
    address: lang === "bn" ? "ঠিকানা" : "Address",
    map: lang === "bn" ? "ম্যাপ" : "Map",
    products: lang === "bn" ? "পণ্য" : "Products",
    total: lang === "bn" ? "মোট" : "Total",
    guest: lang === "bn" ? "গেস্ট" : "Guest",
    none: lang === "bn" ? "প্রদান করা হয়নি" : "Not provided",
    dash: "—",
  };

  const name = order.user?.name || order.guestName || L.guest;
  const phone = order.user?.phone || order.guestPhone || L.none;
  const addressText = formatAddress(order.address);
  const mapsUrl = buildMapsUrl(order.address);

  const lines: string[] = [];
  lines.push(`${L.orderHeader} #${order.orderNo || ""}`);
  lines.push("─────────────────");
  lines.push(`${L.customer}: ${name}`);
  lines.push(`${L.mobile}: ${phone}`);
  if (addressText) lines.push(`${L.address}: ${addressText}`);
  if (mapsUrl) lines.push(`${L.map}: ${mapsUrl}`);
  lines.push("─────────────────");

  const items = order.items ?? [];
  lines.push(`${L.products} (${items.length}):`);
  if (items.length === 0) {
    lines.push(`- ${L.dash}`);
  } else {
    items.forEach((it, i) => {
      const title = it.nameSnapshot || "";
      const unit = formatBDT(it.unitPrice ?? 0);
      const qty = it.qty ?? 0;
      const line = formatBDT(it.lineTotal ?? 0);
      lines.push(`${i + 1}. ${title} × ${qty} = ${line}`);
      // Drop the per-line unit price unless it's useful — it bloat the
      // WhatsApp message. Keep one inline hint for the rider's reference.
      void unit;
    });
  }

  lines.push("");
  lines.push(`${L.total}: ${formatBDT(order.grandTotal ?? 0)}`);

  return lines.join("\n");
}

/** Pastes the order summary into the clipboard with a fallback for
 *  browsers that block navigator.clipboard. Returns true on success. */
export async function copyOrderSummary(
  order: OrderLike,
  lang: "bn" | "en",
): Promise<boolean> {
  const text = buildOrderCopyText(order, lang);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: textarea + execCommand (works in older browsers and
    // when the page is not focused).
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
