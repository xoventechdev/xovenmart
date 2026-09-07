"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Upload,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";

/* ────────────────────────────────────────────────────────────────
 * Price-update CSV columns. The only required column is `sku`; the
 * three price columns are all optional — leave blank to leave that
 * field unchanged on the product. So you can update just salePrice,
 * just costPrice, or any combination.
 * ──────────────────────────────────────────────────────────────── */
const COLUMNS = [
  { key: "sku",       required: true,  sample: "XM-000001", descBn: "পণ্যের SKU (যেটা অটো-জেনারেটেড)", descEn: "Product SKU (the auto-generated one)" },
  { key: "mrp",       required: false, sample: "650",       descBn: "নতুন MRP (ফাঁকা = আগেরটা বহাল)", descEn: "New MRP (blank = keep existing)" },
  { key: "salePrice", required: false, sample: "550",       descBn: "নতুন বিক্রয় মূল্য (ফাঁকা = আগেরটা বহাল)", descEn: "New sale price (blank = keep existing)" },
  { key: "costPrice", required: false, sample: "450",       descBn: "নতুন ক্রয় মূল্য — শুধু অ্যাডমিন দেখবে", descEn: "New cost — admin only" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
type ParsedRow = {
  rowIndex: number;
  values: Partial<Record<ColumnKey, string>>;
  errors: string[];
};

type ProductLookup = Record<string, {
  id: string;
  nameBn: string;
  nameEn: string;
  mrp: number;
  salePrice: number;
  costPrice: number;
}>;

type RowResolution =
  | { ok: true; row: ParsedRow; product: ProductLookup[string]; patch: { mrp?: number; salePrice?: number; costPrice?: number } }
  | { ok: false; row: ParsedRow; reason: string };

/* ────────────────────────────────────────────────────────────────
 * CSV escape + parse — copied from the import page so the format
 * stays consistent (Excel/Sheets-friendly, RFC4180 quoting).
 * ──────────────────────────────────────────────────────────────── */
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function toCsv(rows: (string | number | boolean | undefined | null)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\r") { /* swallow */ }
      else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/* ────────────────────────────────────────────────────────────────
 * Build an export of the current catalog as a CSV — admins often
 * want to "tweak the same file" rather than start from scratch, and
 * we have all the data already in memory. The export columns match
 * the import columns so the cycle is seamless.
 * ──────────────────────────────────────────────────────────────── */
function buildExportCsv(items: any[]): string {
  const header = COLUMNS.map((c) => c.key);
  const rows: string[][] = [header];
  for (const p of items ?? []) {
    rows.push([p.sku, String(p.mrp), String(p.salePrice), String(p.costPrice ?? 0)]);
  }
  return toCsv(rows);
}

function normalizeNumber(s: string | undefined): number | null {
  if (s === undefined || s === null || s.trim() === "") return null;
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export default function BulkPricesPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  /* ── Catalog snapshot so we can resolve SKU → product + show
        "current vs new" in the preview row. We intentionally don't
        force the admin to choose a category — we want all 500 products
        on hand to resolve any SKU they paste. ── */
  const { data: catData } = useQuery({
    queryKey: ["admin", "products", "all-skus"],
    queryFn: async () => {
      // Pull up to 200 per page; iterate until we have everything.
      const map: ProductLookup = {};
      let page = 1;
      // Hard cap at 50 pages * 200 = 10,000 — more than enough headroom.
      while (page <= 50) {
        const res: any = await api.get(`/admin/products?perPage=200&page=${page}`);
        const items: any[] = res?.items ?? [];
        for (const p of items) {
          map[p.sku] = {
            id: p.id,
            nameBn: p.nameBn,
            nameEn: p.nameEn,
            mrp: Number(p.mrp),
            salePrice: Number(p.salePrice),
            costPrice: Number(p.costPrice ?? 0),
          };
        }
        const total = res?.total ?? 0;
        if (items.length === 0 || page * 200 >= total) break;
        page++;
      }
      return { map, items: Object.values(map) };
    },
    staleTime: 60_000,
  });
  const lookup: ProductLookup = (catData?.map ?? {}) as ProductLookup;
  const allItems = (catData?.items ?? []) as any[];

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; failed: number }>({ done: 0, failed: 0 });
  const [isApplying, setIsApplying] = useState(false);

  /* Resolve every parsed row against the SKU catalog. Computed in a
     memo so re-renders don't redo the work. */
  const resolutions: RowResolution[] = useMemo(() => {
    const out: RowResolution[] = [];
    for (const row of parsed) {
      const sku = (row.values.sku ?? "").trim();
      if (!sku) {
        out.push({ ok: false, row, reason: "missing sku" });
        continue;
      }
      const product = lookup[sku];
      if (!product) {
        out.push({ ok: false, row, reason: `sku "${sku}" not found` });
        continue;
      }
      const mrp = normalizeNumber(row.values.mrp);
      const salePrice = normalizeNumber(row.values.salePrice);
      const costPrice = normalizeNumber(row.values.costPrice);
      const patch: { mrp?: number; salePrice?: number; costPrice?: number } = {};
      if (mrp != null && !Number.isNaN(mrp) && mrp >= 0) patch.mrp = Math.round(mrp);
      if (salePrice != null && !Number.isNaN(salePrice) && salePrice >= 0) patch.salePrice = Math.round(salePrice);
      if (costPrice != null && !Number.isNaN(costPrice) && costPrice >= 0) patch.costPrice = Math.round(costPrice);
      // Must have at least one price column populated to be useful
      if (Object.keys(patch).length === 0) {
        out.push({ ok: false, row, reason: "no price columns set (sku alone won't change anything)" });
        continue;
      }
      // Cross-check salePrice ≤ mrp using the NEW mrp if supplied,
      // otherwise fall back to the existing mrp. This is the most
      // common validation error and worth catching client-side.
      const effectiveMrp = patch.mrp ?? product.mrp;
      if (patch.salePrice != null && patch.salePrice > effectiveMrp) {
        out.push({ ok: false, row, reason: `salePrice ${patch.salePrice} > mrp ${effectiveMrp}` });
        continue;
      }
      out.push({ ok: true, row, product, patch });
    }
    return out;
  }, [parsed, lookup]);

  const validRows = resolutions.filter((r): r is Extract<RowResolution, { ok: true }> => r.ok);
  const invalidRows = resolutions.filter((r): r is Extract<RowResolution, { ok: false }> => !r.ok);

  /* Quick stats on the resolution for the preview summary. */
  const stats = useMemo(() => {
    let priceChanges = 0;
    let mrpChanges = 0;
    let costChanges = 0;
    let totalIncrease = 0;
    let totalDecrease = 0;
    let increases = 0;
    let decreases = 0;
    let unchanged = 0;
    for (const r of validRows) {
      const changed = new Set<string>();
      if (r.patch.salePrice != null && r.patch.salePrice !== r.product.salePrice) {
        changed.add("salePrice");
        const diff = r.patch.salePrice - r.product.salePrice;
        if (diff > 0) { totalIncrease += diff; increases++; }
        else { totalDecrease += Math.abs(diff); decreases++; }
      } else changed.delete("salePrice");
      if (r.patch.mrp != null && r.patch.mrp !== r.product.mrp) { changed.add("mrp"); mrpChanges++; }
      if (r.patch.costPrice != null && r.patch.costPrice !== r.product.costPrice) { changed.add("costPrice"); costChanges++; }
      if (changed.size === 0) unchanged++;
      else priceChanges++;
    }
    return { priceChanges, mrpChanges, costChanges, increases, decreases, totalIncrease, totalDecrease, unchanged, total: resolutions.length };
  }, [validRows, resolutions.length]);

  /* ── Template download ── */
  const downloadTemplate = () => {
    const header = COLUMNS.map((c) => c.key);
    const sample = COLUMNS.map((c) => (c as any).sample);
    const csv = toCsv([header, sample]);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xovenmart-prices-template-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── Export current prices (live "extract" to edit offline) ── */
  const downloadCurrent = () => {
    const csv = buildExportCsv(allItems);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xovenmart-prices-current-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── File / paste parse ── */
  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const text = await file.text();
      consume(text);
    } catch {
      toast.error(t("ফাইল পড়তে ব্যর্থ", "Failed to read file"));
    }
  };
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };
  const consume = (text: string) => {
    const rows = parseCsv(text);
    if (rows.length === 0) { toast.error(t("ফাইল খালি", "File is empty")); setParsed([]); return; }
    const headerCells = rows[0].map((s) => s.trim().toLowerCase());
    const skuIdx = headerCells.indexOf("sku");
    if (skuIdx < 0) {
      toast.error(t("'sku' কলাম মিসিং", "Missing 'sku' column"));
      setParsed([]);
      return;
    }
    const colIndex = (key: string) => headerCells.indexOf(key.toLowerCase());
    const dataRows = rows.slice(1);
    const out: ParsedRow[] = dataRows.map((cells, idx) => {
      const rowIndex = idx + 2;
      const values: Partial<Record<ColumnKey, string>> = {};
      for (const col of COLUMNS) {
        const i = colIndex(col.key);
        if (i >= 0 && i < cells.length) (values as any)[col.key] = (cells[i] ?? "").toString();
      }
      return { rowIndex, values, errors: [] };
    });
    setParsed(out);
    toast.success(t(`${out.length}টি রো পার্স হয়েছে`, `Parsed ${out.length} row(s)`));
  };

  /* ── Apply: PATCH every valid row in parallel batches. Same
        pattern the import page uses — gentle on the API but quick. ── */
  const apply = async () => {
    if (validRows.length === 0) {
      toast.error(t("কোনো ভ্যালিড রো নেই", "No valid rows to apply"));
      return;
    }
    const confirmed = window.confirm(
      t(
        `${validRows.length}টি পণ্যের দাম আপডেট করবেন? এই অ্যাকশন নিয়ে একটি অডিট-লগ এন্ট্রি তৈরি হবে।`,
        `Update prices on ${validRows.length} product(s)? An audit-log entry will be created.`,
      ),
    );
    if (!confirmed) return;
    setIsApplying(true);
    setProgress({ done: 0, failed: 0 });
    let done = 0;
    let failed = 0;
    const errorDetails: Array<{ sku: string; msg: string }> = [];
    const batchSize = 5;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((r) => api.patch(`/admin/products/${r.product.id}`, r.patch)),
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled") done++;
        else {
          failed++;
          const e: any = r.reason;
          const sku = batch[j]?.product?.id ?? "?";
          const msg =
            e?.data?.message?.toString?.() ||
            (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ||
            e?.message ||
            "Unknown error";
          errorDetails.push({ sku: batch[j]?.row?.values?.sku ?? sku, msg });
        }
      }
      setProgress({ done, failed });
    }
    setIsApplying(false);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["catalog", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "products", "all-skus"] });
    if (failed === 0) {
      toast.success(t(`${done}টি দাম আপডেট হয়েছে`, `Updated ${done} price(s)`));
      setParsed([]);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      toast.error(
        t(
          `${done} সফল, ${failed} ব্যর্থ। প্রথম ত্রুটি: ${errorDetails[0]?.sku} — ${errorDetails[0]?.msg}`,
          `${done} updated, ${failed} failed. First error: ${errorDetails[0]?.sku} — ${errorDetails[0]?.msg}`,
        ),
      );
      // eslint-disable-next-line no-console
      console.error("Bulk price update errors:", errorDetails);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("পণ্য তালিকায়", "Back to products")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
          <TrendingUp className="mr-2 inline h-6 w-6" />
          {t("বাল্ক দাম আপডেট", "Bulk Price Update")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "CSV থেকে একসাথে অনেক পণ্যের MRP / বিক্রয়মূল্য / ক্রয়মূল্য আপডেট করুন — টেমপ্লেট ডাউনলোড করুন, সালোক-প্রিভিউ দেখুন, তারপর অ্যাপ্লাই করুন।",
            "Update MRP, sale, and cost prices for many products at once — download the template, preview changes, then apply.",
          )}
        </p>
      </div>

      {/* ── Step 1: Template / current-prices export ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary-700" />
            {t("ধাপ ১ — টেমপ্লেট বা বর্তমান দাম", "Step 1 — Template or current prices")}
          </CardTitle>
          <CardDescription>
            {t(
              "খালি টেমপ্লেট ডাউনলোড করুন, অথবা বর্তমান সব পণ্যের দাম CSV হিসেবে নিন — পরে এক্সেলে এডিট করে আপলোড করতে পারবেন।",
              "Download an empty template, or grab the current prices of all products to edit offline in Excel.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="h-4 w-4" /> {t("খালি টেমপ্লেট", "Empty template")}
            </Button>
            <Button onClick={downloadCurrent}>
              <Download className="h-4 w-4" /> {t("বর্তমান দাম ({n})", `Current prices (${allItems.length})`)}
            </Button>
            <span className="text-xs text-ink-500">
              {t(`ক্যাটালগে ${allItems.length}টি পণ্য আছে`, `${allItems.length} product(s) in catalog`)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Step 2: Upload CSV ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-primary-700" />
            {t("ধাপ ২ — ফাইল আপলোড করুন", "Step 2 — Upload your file")}
          </CardTitle>
          <CardDescription>
            {t(
              "একটি CSV ফাইল বাছাই করুন যেখানে কলাম আছে: sku, mrp, salePrice, costPrice — যেকোনো মিশ্রণ চলবে।",
              "Pick a CSV with columns: sku, mrp, salePrice, costPrice — any combination works.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileInput} className="hidden" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {fileName ?? t("CSV ফাইল বাছাই করুন", "Choose CSV file")}
            </Button>
            {fileName && (
              <button
                type="button"
                onClick={() => {
                  setParsed([]);
                  setFileName(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs text-ink-500 underline"
              >
                {t("মুছে ফেলুন", "Clear")}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Step 3: Dry-run preview ── */}
      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary-700" />
              {t("ধাপ ৩ — প্রিভিউ ও অ্যাপ্লাই", "Step 3 — Preview & apply")}
            </CardTitle>
            <CardDescription>
              {t(
                `${parsed.length}টি রো পার্স হয়েছে। ${validRows.length}টি প্রয়োগযোগ্য, ${invalidRows.length}টি বাদ দেওয়া হবে।`,
                `Parsed ${parsed.length} row(s). ${validRows.length} applicable, ${invalidRows.length} will be skipped.`,
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">
              <Stat label={t("অ্যাপ্লাইযোগ্য", "Applicable")} value={validRows.length} variant="ok" />
              <Stat label={t("বাদ দেওয়া", "Skipped")} value={invalidRows.length} variant="error" />
              <Stat label={t("বাড়বে", "↑ Increases")} value={stats.increases} variant="muted" />
              <Stat label={t("কমবে", "↓ Decreases")} value={stats.decreases} variant="muted" />
              <Stat
                label={t("নেট পরিবর্তন", "Net change")}
                value={stats.totalIncrease - stats.totalDecrease}
                variant={(stats.totalIncrease - stats.totalDecrease) === 0 ? "muted" : stats.totalIncrease > stats.totalDecrease ? "warn" : "ok"}
                prefix="৳"
              />
            </div>

            {/* Preview table */}
            <div className="max-h-[480px] overflow-auto rounded border border-ink-200 dark:border-ink-300">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-ink-50">
                  <tr className="border-b border-ink-200">
                    <th className="px-2 py-1.5 text-left">{t("#", "#")}</th>
                    <th className="px-2 py-1.5 text-left">{t("SKU", "SKU")}</th>
                    <th className="px-2 py-1.5 text-left">{t("নাম", "Name")}</th>
                    <th className="px-2 py-1.5 text-right">{t("MRP (আগে→পরে)", "MRP (old→new)")}</th>
                    <th className="px-2 py-1.5 text-right">{t("সেল (আগে→পরে)", "Sale (old→new)")}</th>
                    <th className="px-2 py-1.5 text-right">{t("কস্ট (আগে→পরে)", "Cost (old→new)")}</th>
                    <th className="px-2 py-1.5 text-center">{t("স্ট্যাটাস", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutions.map((r, i) => {
                    const num = i + 1;
                    if (!r.ok) {
                      return (
                        <tr key={i} className="border-b border-ink-100 bg-rose-50/40 dark:bg-rose-900/10">
                          <td className="px-2 py-1 text-ink-500">{r.row.rowIndex}</td>
                          <td className="px-2 py-1 font-mono">{r.row.values.sku ?? "—"}</td>
                          <td className="px-2 py-1 text-ink-500" colSpan={4}>—</td>
                          <td className="px-2 py-1 text-center">
                            <span title={r.reason} className="inline-flex items-center gap-1 text-rose-600">
                              <XCircle className="h-3 w-3" />
                              <span className="truncate">{r.reason}</span>
                            </span>
                          </td>
                          {/* hide */}
                          <td className="hidden">{num}</td>
                        </tr>
                      );
                    }
                    const cellClass = (oldV: number, newV: number | undefined) => {
                      if (newV == null || newV === oldV) return "text-ink-500";
                      if (newV > oldV) return "text-emerald-700 font-semibold";
                      if (newV < oldV) return "text-rose-700 font-semibold";
                      return "text-ink-900 dark:text-ink-900";
                    };
                    return (
                      <tr key={i} className="border-b border-ink-100">
                        <td className="px-2 py-1 text-ink-500">{r.row.rowIndex}</td>
                        <td className="px-2 py-1 font-mono">{r.product ? r.product.id.slice(-6) : r.row.values.sku}</td>
                        <td className="px-2 py-1 truncate">{lang === "bn" ? r.product.nameBn : r.product.nameEn}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          <span className="text-ink-400">{formatBDT(r.product.mrp)}</span>
                          {" → "}
                          <span className={cellClass(r.product.mrp, r.patch.mrp)}>
                            {r.patch.mrp != null ? formatBDT(r.patch.mrp) : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          <span className="text-ink-400">{formatBDT(r.product.salePrice)}</span>
                          {" → "}
                          <span className={cellClass(r.product.salePrice, r.patch.salePrice)}>
                            {r.patch.salePrice != null ? formatBDT(r.patch.salePrice) : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          <span className="text-ink-400">{formatBDT(r.product.costPrice)}</span>
                          {" → "}
                          <span className={cellClass(r.product.costPrice, r.patch.costPrice)}>
                            {r.patch.costPrice != null ? formatBDT(r.patch.costPrice) : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Badge variant="muted" className="text-[10px]">
                            <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-600" />
                            {t("ঠিক আছে", "OK")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <p className="text-xs text-ink-500">
                {t(
                  "সবুজ = বাড়বে, লাল = কমবে, ধূসর = একই থাকবে। ভুল রো সংশোধন করে আবার আপলোড করুন।",
                  "Green = will rise, red = will fall, gray = unchanged. Fix errored rows and re-upload.",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={isApplying}
                  onClick={() => {
                    setParsed([]);
                    setFileName(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  {t("বাতিল", "Cancel")}
                </Button>
                <Button onClick={apply} disabled={isApplying || validRows.length === 0}>
                  {isApplying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                  {isApplying
                    ? t(
                        `অ্যাপ্লাই হচ্ছে... ${progress.done}/${progress.done + progress.failed}`,
                        `Applying… ${progress.done}/${progress.done + progress.failed}`,
                      )
                    : t(
                        `${validRows.length}টি দাম অ্যাপ্লাই করুন`,
                        `Apply ${validRows.length} price update(s)`,
                      )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Column reference ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary-700" />
            {t("কলাম গাইড", "Column reference")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="px-2 py-1.5">Column</th>
                <th className="px-2 py-1.5">{t("বাধ্যতামূলক?", "Required?")}</th>
                <th className="px-2 py-1.5">{t("উদাহরণ", "Example")}</th>
                <th className="px-2 py-1.5">{t("বিবরণ", "Description")}</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={c.key} className="border-b border-ink-100">
                  <td className="px-2 py-1 font-mono">{c.key}</td>
                  <td className="px-2 py-1">
                    {c.required ? <span className="text-rose-600">{t("হ্যাঁ", "yes")}</span> : <span className="text-ink-500">{t("না", "no")}</span>}
                  </td>
                  <td className="px-2 py-1 text-ink-500">{c.sample}</td>
                  <td className="px-2 py-1 text-ink-600">{lang === "bn" ? c.descBn : c.descEn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Tips ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t("বিশেষ দ্রষ্টব্য", "Tips & known limits")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-ink-600">
          <p>
            • {t(
              "শুধু যেসব কলাম পূরণ করবেন সেগুলোই বদলাবে — বাকিগুলো যেমন ছিল তেমনই থাকবে।",
              "Only the columns you fill in get changed — the rest stay as-is. So updating just `salePrice` leaves MRP and cost alone.",
            )}
          </p>
          <p>
            • {t(
              "একই সার্ভার একই SKU দিয়ে দুইবার আসলে দ্বিতীয়টা প্রযোজ্য হবে — ফাইলে ডুপ্লিকেট এড়িয়ে চলুন।",
              "If the same SKU appears twice in your file, the later row wins — keep the file deduped.",
            )}
          </p>
          <p>
            • {t(
              "অ্যাপ্লাই করার আগে প্রিভিউ টেবিলে সবুজ/লাল সেলগুলো চেক করুন — মোট বাড়া/কমার পরিমাণ কার্ডের উপরে দেখানো হচ্ছে।",
              "Before applying, scan the green/red cells in the preview — total rise/fall amounts are summarized above the table.",
            )}
          </p>
          <p>
            • {t(
              "সার্ভার প্রতিটি PATCH-এ একটি অডিট-লগ এন্ট্রি লিখবে — /admin/system/audit-log এ দেখতে পারবেন।",
              "Each PATCH creates an audit-log entry — view them at /admin/system/audit-log.",
            )}
          </p>
          <p>
            • {t(
              "যেকোনো সময় রো-টি-রো-টি এডিট করতে চাইলে পণ্য তালিকায় MRP/সেল সেলে ক্লিক করুন।",
              "For row-level edits anytime, just click the MRP/Sale cell on the products list.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label, value, variant, prefix,
}: {
  label: string;
  value: number;
  variant: "ok" | "error" | "muted" | "warn";
  prefix?: string;
}) {
  const cls =
    variant === "ok"
      ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700"
      : variant === "error"
      ? "bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700"
      : variant === "warn"
      ? "bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700"
      : "bg-ink-50 border-ink-200 text-ink-700 dark:bg-ink-100 dark:border-ink-300";
  return (
    <div className={`rounded border ${cls} px-3 py-2`}>
      <div className="text-2xl font-bold tabular-nums">{prefix}{value.toLocaleString()}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
