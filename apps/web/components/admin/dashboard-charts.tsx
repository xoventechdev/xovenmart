"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Reusable dashboard chart widgets.
 *
 * Each chart is a presentational component — it takes its data as a prop and
 * renders the chart inside a ResponsiveContainer. The dashboard page owns the
 * queries and assembles the layout; these components are pure.
 *
 * Colors are aligned with the XovenMart primary palette so the charts feel
 * like part of the admin panel, not a generic analytics tool:
 *   - primary-500  for revenue / order counts (brand)
 *   - success-500  for delivered / paid
 *   - warning-500  for in-progress
 *   - danger-500   for cancelled / low stock
 *   - accent-500   for COD, prepared
 */

const COLORS = {
  primary: "#f97316",   // orange-500 — brand
  primarySoft: "#fdba74", // orange-300
  success: "#10b981",   // emerald-500
  warning: "#f59e0b",   // amber-500
  danger:  "#ef4444",   // red-500
  accent:  "#6366f1",   // indigo-500
  muted:   "#94a3b8",   // slate-400
  ink:     "#1e293b",   // slate-800
};

// ─── Daily Revenue + Orders Trend ────────────────────────────────

/**
 * Two-series line chart: revenue (left axis) + order count (right axis).
 * The dual-axis setup lets us see volume + value on the same time scale.
 *
 * Data shape: [{ date: "YYYY-MM-DD", orders: number, revenue: number, cancelled: number }]
 */
export function RevenueTrendChart({ data, lang }: { data: { date: string; orders: number; revenue: number; cancelled: number }[]; lang: "bn" | "en" }) {
  const labels = {
    revenue: lang === "bn" ? "আয়" : "Revenue",
    orders: lang === "bn" ? "অর্ডার" : "Orders",
    cancelled: lang === "bn" ? "বাতিল" : "Cancelled",
  };
  const fmtDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString(lang === "bn" ? "en-US" : "en-US", { day: "2-digit", month: "short" });
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#94a3b8" fontSize={11} />
        <YAxis yAxisId="left" stroke={COLORS.primary} fontSize={11} tickFormatter={(v) => `৳${v}`} />
        <YAxis yAxisId="right" orientation="right" stroke={COLORS.accent} fontSize={11} />
        <Tooltip
          labelFormatter={fmtDate}
          formatter={(value: any, name: any) => {
            if (name === labels.revenue) return [`৳${value}`, labels.revenue];
            return [value, name];
          }}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="left"  type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 3 }} name={labels.revenue} />
        <Line yAxisId="right" type="monotone" dataKey="orders"   stroke={COLORS.accent}  strokeWidth={2}   dot={{ r: 3 }} name={labels.orders} />
        <Line yAxisId="right" type="monotone" dataKey="cancelled" stroke={COLORS.danger}  strokeWidth={1.5} dot={false} name={labels.cancelled} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Order Status Funnel ─────────────────────────────────────────

/**
 * Horizontal stacked bar showing how many orders are in each lifecycle stage.
 * Stages left-to-right: PENDING → ACCEPTED → PREPARING → PREPARED → OUT_FOR_DELIVERY → DELIVERED.
 * The colour intensity drops from warning → accent → success as the order
 * progresses toward delivery, so the eye lands on the active stages first.
 */
const FUNNEL_STAGES = [
  { key: "PENDING",         color: COLORS.danger,  bn: "অপেক্ষমান",   en: "Pending" },
  { key: "ACCEPTED",        color: COLORS.warning, bn: "গৃহীত",      en: "Accepted" },
  { key: "PREPARING",       color: COLORS.warning, bn: "প্রস্তুত হচ্ছে", en: "Preparing" },
  { key: "PREPARED",        color: COLORS.accent,  bn: "প্রস্তুত",    en: "Ready" },
  { key: "OUT_FOR_DELIVERY",color: COLORS.accent,  bn: "ডেলিভারিতে",   en: "Dispatched" },
  { key: "DELIVERED",       color: COLORS.success, bn: "ডেলিভার্ড",   en: "Delivered" },
];

export function StatusFunnel({ counts, lang }: { counts: Record<string, number>; lang: "bn" | "en" }) {
  const data = FUNNEL_STAGES.map((s) => ({
    name: lang === "bn" ? s.bn : s.en,
    key: s.key,
    value: counts[s.key] ?? 0,
    color: s.color,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={11} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={90} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Top Products ────────────────────────────────────────────────

/**
 * Top-N best-selling products by quantity (last 7 days).
 * Horizontal bar chart with product name on Y axis.
 */
export function TopProductsChart({ items, lang }: { items: { nameEn: string; nameBn: string; qty: number; revenue: number }[]; lang: "bn" | "en" }) {
  const data = items.map((it) => ({
    name: (lang === "bn" ? it.nameBn : it.nameEn) || it.nameEn,
    qty: it.qty,
    revenue: it.revenue,
  }));
  const labels = {
    qty: lang === "bn" ? "পরিমাণ" : "Qty",
  };
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, items.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={11} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={120} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
        <Bar dataKey="qty" fill={COLORS.primary} name={labels.qty} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Payment Method Breakdown ────────────────────────────────────

/**
 * Donut chart showing revenue share by payment method (last 30 days).
 * Centre label shows total revenue.
 */
export function PaymentSplitDonut({ items, lang }: { items: { method: string; orders: number; revenue: number }[]; lang: "bn" | "en" }) {
  const total = items.reduce((s, i) => s + i.revenue, 0);
  const data = items.map((i) => ({ name: i.method, value: i.revenue }));
  const palette = [COLORS.primary, COLORS.accent, COLORS.success, COLORS.warning, COLORS.danger, COLORS.muted];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [`৳${value}`, name]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xs text-ink-500">{lang === "bn" ? "মোট" : "Total"}</div>
        <div className="text-lg font-bold text-ink-900 dark:text-ink-900">৳{total.toLocaleString()}</div>
      </div>
    </div>
  );
}

// ─── Orders by Source ────────────────────────────────────────────

/**
 * Donut chart for orders split by source channel (WEB / POS / ANDROID) over
 * the last 30 days. Useful when you ship the Android app and want to see
 * which channels are pulling weight.
 */
export function SourceSplitDonut({ split, lang }: { split: { WEB: number; POS: number; ANDROID: number }; lang: "bn" | "en" }) {
  const labels = {
    WEB: lang === "bn" ? "ওয়েব" : "Web",
    POS: lang === "bn" ? "POS" : "POS",
    ANDROID: lang === "bn" ? "অ্যান্ড্রয়েড" : "Android",
  };
  const data = [
    { name: labels.WEB, value: split.WEB, color: COLORS.primary },
    { name: labels.POS, value: split.POS, color: COLORS.accent },
    { name: labels.ANDROID, value: split.ANDROID, color: COLORS.success },
  ].filter((d) => d.value > 0);
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-ink-500">
        {lang === "bn" ? "কোন ডেটা নেই" : "No data yet"}
      </div>
    );
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xs text-ink-500">{lang === "bn" ? "মোট" : "Total"}</div>
        <div className="text-lg font-bold text-ink-900 dark:text-ink-900">{total}</div>
      </div>
    </div>
  );
}

// ─── Category Revenue Split ──────────────────────────────────────

/**
 * Horizontal bar chart showing top-6 categories by revenue (last 30 days).
 * Categories beyond 6 are aggregated into "Other" by the backend.
 */
export function CategorySplitChart({ items, lang }: { items: { category: string; revenue: number }[]; lang: "bn" | "en" }) {
  const data = items.map((i) => ({ name: i.category, revenue: i.revenue }));
  const label = lang === "bn" ? "আয়" : "Revenue";
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, items.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `৳${v}`} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={120} />
        <Tooltip
          formatter={(value: any) => `৳${value}`}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
        />
        <Bar dataKey="revenue" fill={COLORS.primary} name={label} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
