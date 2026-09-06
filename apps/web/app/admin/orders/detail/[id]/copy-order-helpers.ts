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
 *   অর্ডার #XVM-260905-001 · ডেলিভারিতে
 *   ─────────────────
 *   কাস্টমার: মোঃ কামাল
 *   মোবাইল: ০১৭২০৬৯৪৫১৩
 *   ঠিকানা: বাড়ি ২৩, মধ্যপাড়া, মুড়াফরগঞ্জ
 *   পিন: 23.7853, 91.1153
 *   ম্যাপ: https://www.google.com/maps?q=23.7853,91.1153
 *   পেমেন্ট: COD · UNPAID
 *   ─────────────────
 *   পণ্য (৩):
 *   1. চাল ৫ কেজি × ২ = ৳১২০০
 *   2. তেল ১ লিটার × ১ = ৳২৫০
 *   ─────────────────
 *   সাবটোটাল: ৳১৪৫০
 *   ডেলিভারি ফি: ৳৪০
 *   মোট: ৳১৪৯০
 *   পেমেন্ট: COD
 *
 * (EN locale labels replace the Bangla strings.)
 *
 * Defensive against missing fields — the formatter always returns a
 * valid string even if the order has no address, no phone, no lat/lng,
 * no payment method, or no items. Better to copy *something* than to
 * crash the clipboard call.
 */

import { formatBDT } from "@/lib/utils";

interface OrderLike {
  orderNo?: string | null;
  status?: string | null;
  user?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  guestName?: string | null;
  guestPhone?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  notes?: string | null;
  // Canonical shape from the orders.service.ts serializer + the new
  // admin controller normalization (admin/orders/:id).
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
  // Fallback for any endpoint that still surfaces the raw Prisma
  // column name (e.g. older admin endpoints that didn't rename it).
  // The helper tries `address` first, then `addressSnapshot`.
  addressSnapshot?: OrderLike["address"];
  items?: Array<{
    nameSnapshot?: string | null;
    unitPrice?: number | string | null;
    qty?: number | null;
    lineTotal?: number | string | null;
  }>;
  subtotal?: number | string | null;
  discountTotal?: number | string | null;
  deliveryFee?: number | string | null;
  grandTotal?: number | string | null;
}

/** Build the Google Maps URL. Priority:
 *   1. lat,lng pin → `https://www.google.com/maps?q=lat,lng` (one-tap nav)
 *   2. full text or joined legacy lines → search query URL
 *   3. null if neither available. */
function buildMapsUrl(addr: OrderLike["address"]): string | null {
  if (!addr) return null;
  const lat = addr.lat != null && addr.lat !== "" ? Number(addr.lat) : NaN;
  const lng = addr.lng != null && addr.lng !== "" ? Number(addr.lng) : NaN;
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

/** Formats the captured pin coords as a string like "23.7853, 91.1153".
 *  Returns null if no usable coords. Used as a rider-friendly backup
 *  they can copy into any maps app — the Maps URL is also emitted
 *  separately. */
function formatPin(addr: OrderLike["address"]): string | null {
  if (!addr) return null;
  const lat = addr.lat != null && addr.lat !== "" ? Number(addr.lat) : NaN;
  const lng = addr.lng != null && addr.lng !== "" ? Number(addr.lng) : NaN;
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Bilingual order-status label for the WhatsApp header line. Mirrors
 *  the `STATUS_BN` map in the backend's orders.service.ts so the admin
 *  doesn't see raw enum names in chat. */
function statusLabel(status: string | null | undefined, lang: "bn" | "en"): string {
  if (!status) return "";
  const MAP_BN: Record<string, string> = {
    PENDING: "অপেক্ষমান",
    ACCEPTED: "গৃহীত",
    PREPARING: "প্রস্তুত হচ্ছে",
    PREPARED: "প্রস্তুত",
    OUT_FOR_DELIVERY: "ডেলিভারিতে",
    DELIVERED: "ডেলিভারি সম্পন্ন",
    CANCELLED: "বাতিল",
    RETURNED: "ফেরত",
    REFUNDED: "টাকা ফেরত",
  };
  if (lang === "bn") return MAP_BN[status] ?? status;
  return status.replace(/_/g, " ").toLowerCase();
}

export function buildOrderCopyText(order: OrderLike, lang: "bn" | "en"): string {
  const L = {
    orderHeader: lang === "bn" ? "অর্ডার" : "Order",
    customer: lang === "bn" ? "কাস্টমার" : "Customer",
    mobile: lang === "bn" ? "মোবাইল" : "Mobile",
    email: lang === "bn" ? "ইমেইল" : "Email",
    address: lang === "bn" ? "ঠিকানা" : "Address",
    pin: lang === "bn" ? "পিন" : "Pin",
    map: lang === "bn" ? "ম্যাপ" : "Map",
    payment: lang === "bn" ? "পেমেন্ট" : "Payment",
    note: lang === "bn" ? "নোট" : "Note",
    products: lang === "bn" ? "পণ্য" : "Products",
    subtotal: lang === "bn" ? "সাবটোটাল" : "Subtotal",
    discount: lang === "bn" ? "ছাড়" : "Discount",
    deliveryFee: lang === "bn" ? "ডেলিভারি ফি" : "Delivery Fee",
    free: lang === "bn" ? "ফ্রি" : "Free",
    total: lang === "bn" ? "মোট" : "Total",
    guest: lang === "bn" ? "গেস্ট" : "Guest",
    none: lang === "bn" ? "প্রদান করা হয়নি" : "Not provided",
    dash: "—",
  };

  // Header line: orderNo + current status (so the rider sees at a glance
  // whether this is a "new" order, "preparing", etc).
  const statusText = statusLabel(order.status, lang);
  const headerSuffix = statusText
    ? (lang === "bn" ? ` · ${statusText}` : ` · ${statusText}`)
    : "";

  const name = order.user?.name || order.guestName || L.guest;
  const phone = order.user?.phone || order.guestPhone || L.none;
  const email = order.user?.email || null;
  // Resolve address defensively. Most admin endpoints expose the
  // snapshot as `order.address` (the canonical field name in the
  // orders.service.ts serializer). Older endpoints that haven't been
  // renamed still surface it as `order.addressSnapshot` — fall back
  // so the copy is never missing address / pin / map URL again.
  const address = order.address ?? order.addressSnapshot ?? null;
  const addressText = formatAddress(address);
  const pinText = formatPin(address);
  const mapsUrl = buildMapsUrl(address);

  // Payment method is critical for COD riders (they collect cash) —
  // include it both in the header (right after maps) and again at the
  // bottom near the total for redundancy. If missing, surface "—" so
  // the rider can ask.
  const paymentLine = order.paymentMethod
    ? `${order.paymentMethod}${order.paymentStatus ? ` · ${order.paymentStatus}` : ""}`
    : L.dash;

  const lines: string[] = [];
  lines.push(`${L.orderHeader} #${order.orderNo || ""}${headerSuffix}`);
  lines.push("─────────────────");
  lines.push(`${L.customer}: ${name}`);
  lines.push(`${L.mobile}: ${phone}`);
  if (email) lines.push(`${L.email}: ${email}`);
  if (addressText) lines.push(`${L.address}: ${addressText}`);
  if (pinText) lines.push(`${L.pin}: ${pinText}`);
  if (mapsUrl) lines.push(`${L.map}: ${mapsUrl}`);
  lines.push(`${L.payment}: ${paymentLine}`);
  // Customer notes / delivery instructions — often critical context
  // (gate codes, "leave at door", "call on arrival"). Render after
  // payment so the rider's eye lands on the address/payment first and
  // notes second. Trim + skip empty strings defensively.
  if (order.notes && order.notes.trim()) {
    lines.push(`${L.note}: ${order.notes.trim()}`);
  }
  lines.push("─────────────────");

  const items = order.items ?? [];
  lines.push(`${L.products} (${items.length}):`);
  if (items.length === 0) {
    lines.push(`- ${L.dash}`);
  } else {
    items.forEach((it, i) => {
      const title = it.nameSnapshot || "";
      const qty = it.qty ?? 0;
      const line = formatBDT(it.lineTotal ?? 0);
      lines.push(`${i + 1}. ${title} × ${qty} = ${line}`);
    });
  }

  // ─── Money breakdown ─────────────────────────────────────────
  // Always show subtotal / discount / delivery / total. Even if all
  // numbers are zero, the lines make the format predictable so a rider
  // who's seen one copy block knows where to look for each field.
  const subtotal = Number(order.subtotal ?? order.grandTotal ?? 0);
  const discount = Number(order.discountTotal ?? 0);
  const deliveryFee = Number(order.deliveryFee ?? 0);
  const grandTotal = Number(order.grandTotal ?? 0);

  lines.push("─────────────────");
  lines.push(`${L.subtotal}: ${formatBDT(subtotal)}`);
  if (discount > 0) {
    lines.push(`${L.discount}: -${formatBDT(discount)}`);
  }
  lines.push(
    `${L.deliveryFee}: ${deliveryFee > 0 ? formatBDT(deliveryFee) : L.free}`,
  );
  lines.push(`${L.total}: ${formatBDT(grandTotal)}`);

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
