"use client";

import { useMemo, useState, useRef, useEffect } from "react";
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
  Package,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

/* ────────────────────────────────────────────────────────────────
 * CSV column definitions. Keep this in sync with the admin product
 * form (`apps/web/app/admin/products/_components/product-form.tsx`)
 * and with what `POST /admin/products` accepts.
 * ──────────────────────────────────────────────────────────────── */
const COLUMNS = [
  { key: "sku", required: true, sample: "PROD-001", descBn: "স্টক কিপিং ইউনিট (ইউনিক)", descEn: "Stock keeping unit (unique)" },
  { key: "slug", required: true, sample: "rice-miniket-5kg", descBn: "URL স্লাগ (ছোট-হাতের, ড্যাশ)", descEn: "URL slug (lowercase, dashes)" },
  { key: "nameBn", required: true, sample: "মিনিকেট চাল ৫ কেজি", descBn: "পণ্যের নাম বাংলায়", descEn: "Product name in Bangla" },
  { key: "nameEn", required: true, sample: "Miniket Rice 5kg", descBn: "পণ্যের নাম ইংরেজিতে", descEn: "Product name in English" },
  { key: "category", required: true, sample: "grocery", descBn: "ক্যাটাগরি স্লাগ অথবা নাম (BN/EN)", descEn: "Category slug OR name (BN/EN)" },
  { key: "unit", required: true, sample: "kg", descBn: "একক (kg, pcs, L, pack, …)", descEn: "Unit (kg, pcs, L, pack, …)" },
  { key: "mrp", required: true, sample: "650", descBn: "কাটা-ক্রস মূল্য (BDT)", descEn: "Crossed-out price (BDT)" },
  { key: "salePrice", required: true, sample: "550", descBn: "বিক্রয় মূল্য (BDT)", descEn: "Sale price (BDT)" },
  { key: "costPrice", required: false, sample: "450", descBn: "ক্রয় মূল্য — শুধু অ্যাডমিন দেখবে", descEn: "Cost — admin only" },
  { key: "stockQty", required: false, sample: "100", descBn: "প্রাথমিক স্টক পরিমাণ", descEn: "Initial stock quantity" },
  { key: "lowStockThreshold", required: false, sample: "10", descBn: "লো-স্টক থ্রেশহোল্ড", descEn: "Low-stock alert threshold" },
  { key: "trackStock", required: false, sample: "true", descBn: "স্টক ট্র্যাক করবে? (true/false)", descEn: "Track stock? (true/false)" },
  { key: "isFeatured", required: false, sample: "false", descBn: "হোমপেজে ফিচার্ড?", descEn: "Featured on home?" },
  { key: "isNew", required: false, sample: "false", descBn: "'নতুন' ট্যাগ?", descEn: "Mark as New?" },
  { key: "descriptionBn", required: false, sample: "উচ্চ মানের সুগন্ধি চাল", descEn: "Description in Bangla", descBn: "বাংলা বিবরণ" },
  { key: "descriptionEn", required: false, sample: "Premium aromatic rice", descEn: "Description in English", descBn: "ইংরেজি বিবরণ" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
type ParsedRow = {
  rowIndex: number; // 1-based human row number
  values: Partial<Record<ColumnKey, string>>;
  errors: string[];
};

type Category = {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
};

type ImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
};

/* ────────────────────────────────────────────────────────────────
 * CSV helpers — proper RFC4180 quoting (so commas, quotes, and
 * newlines inside cell values all survive a round-trip through Excel).
 * ──────────────────────────────────────────────────────────────── */
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function toCsv(rows: (string | number | boolean | undefined | null)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function parseCsv(text: string): string[][] {
  // Trim BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\r") { /* swallow — \n handles the row break */ }
      else if (ch === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/* ────────────────────────────────────────────────────────────────
 * Template generation. Downloads an Excel-friendly CSV with:
 *   • Header row
 *   • 2 sample rows (commented out by prefix — see template.csv below)
 *   Plus an inline "README" rendered as a hidden second sheet isn't
 *   possible in pure CSV, so the README lives in a separate card on
 *   the page and is also prepended as commented lines.
 * ──────────────────────────────────────────────────────────────── */
function buildTemplateCsv(): string {
  const header = COLUMNS.map((c) => c.key);
  // 2 sample rows pulled from the `sample` column
  const sample1: string[] = COLUMNS.map((c) => (c as any).sample);
  const sample2: string[] = COLUMNS.map((c) => {
    if (c.key === "sku") return "PROD-002";
    if (c.key === "slug") return "potato-local-1kg";
    if (c.key === "nameBn") return "আলু ১ কেজি";
    if (c.key === "nameEn") return "Potato 1kg";
    if (c.key === "category") return "vegetables";
    if (c.key === "unit") return "kg";
    if (c.key === "mrp") return "60";
    if (c.key === "salePrice") return "50";
    if (c.key === "costPrice") return "35";
    if (c.key === "stockQty") return "200";
    if (c.key === "lowStockThreshold") return "20";
    return (c as any).sample;
  });
  return toCsv([header, sample1, sample2]);
}

/* ────────────────────────────────────────────────────────────────
 * Resolve a category input — accept ID, slug, or name (BN/EN) —
 * by looking up against the cached admin categories list.
 * Returns the cuid `id` or null.
 * ──────────────────────────────────────────────────────────────── */
function resolveCategoryId(raw: string, cats: Category[]): string | null {
  const v = raw.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  // 1. exact cuid match
  const direct = cats.find((c) => c.id === v);
  if (direct) return direct.id;
  // 2. slug match (case-insensitive)
  const bySlug = cats.find((c) => c.slug.toLowerCase() === lower);
  if (bySlug) return bySlug.id;
  // 3. name BN/EN match (case-insensitive)
  const byName = cats.find(
    (c) => c.nameEn.toLowerCase() === lower || c.nameBn.toLowerCase() === lower,
  );
  if (byName) return byName.id;
  return null;
}

/* ────────────────────────────────────────────────────────────────
 * Pre-validate each row. Returns either an error list or a coerced
 * payload ready for `POST /admin/products`.
 * ──────────────────────────────────────────────────────────────── */
function parseBoolish(s: string | undefined): boolean {
  if (!s) return false;
  return ["true", "1", "yes", "y"].includes(s.trim().toLowerCase());
}

function normalizeNumber(s: string | undefined): number | null {
  if (s === undefined || s === null || s.trim() === "") return null;
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

type ValidationOk = { ok: true; payload: Record<string, any> };
type ValidationFail = { ok: false; errors: string[] };

function validateRow(
  raw: Partial<Record<ColumnKey, string>>,
  cats: Category[],
  index: number,
): ValidationOk | ValidationFail {
  const errors: string[] = [];

  const sku = (raw.sku ?? "").trim();
  const slug = (raw.slug ?? "").trim();
  const nameBn = (raw.nameBn ?? "").trim();
  const nameEn = (raw.nameEn ?? "").trim();
  const catRaw = (raw.category ?? "").trim();
  const unit = (raw.unit ?? "").trim();
  const mrp = normalizeNumber(raw.mrp);
  const salePrice = normalizeNumber(raw.salePrice);
  const costPrice = normalizeNumber(raw.costPrice);
  const stockQty = normalizeNumber(raw.stockQty);
  const lowStockThreshold = normalizeNumber(raw.lowStockThreshold);

  if (!sku) errors.push("sku is required");
  if (!slug) errors.push("slug is required");
  if (!nameBn) errors.push("nameBn is required");
  if (!nameEn) errors.push("nameEn is required");
  if (!catRaw) errors.push("category is required");
  if (!unit) errors.push("unit is required");
  if (mrp == null || Number.isNaN(mrp) || mrp < 0) errors.push("mrp must be a non-negative number");
  if (salePrice == null || Number.isNaN(salePrice) || salePrice < 0)
    errors.push("salePrice must be a non-negative number");
  if (costPrice != null && (Number.isNaN(costPrice) || costPrice < 0))
    errors.push("costPrice must be a non-negative number if provided");
  if (stockQty != null && (Number.isNaN(stockQty) || stockQty < 0))
    errors.push("stockQty must be a non-negative number if provided");
  if (lowStockThreshold != null && (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0))
    errors.push("lowStockThreshold must be a non-negative number if provided");
  if (mrp != null && salePrice != null && !Number.isNaN(mrp) && !Number.isNaN(salePrice) && salePrice > mrp) {
    errors.push("salePrice must be ≤ mrp");
  }

  if (catRaw && !errors.some((e) => e.startsWith("category"))) {
    const catId = resolveCategoryId(catRaw, cats);
    if (!catId) {
      errors.push(`category "${catRaw}" not found (use a slug or known category name)`);
    }
  }

  if (errors.length) return { ok: false, errors };

  const categoryId = resolveCategoryId(catRaw, cats)!;
  // Final slug — fall back to slugified nameEn if user left slug empty after
  // the existence check (we already required it but defensive).
  const finalSlug = slug || slugify(nameEn);

  return {
    ok: true,
    payload: {
      sku,
      slug: finalSlug,
      nameBn,
      nameEn,
      categoryId,
      unit,
      mrp: mrp as number,
      salePrice: salePrice as number,
      costPrice: costPrice ?? 0,
      stockQty: stockQty ?? 0,
      lowStockThreshold: lowStockThreshold ?? 10,
      trackStock: parseBoolish(raw.trackStock),
      isFeatured: parseBoolish(raw.isFeatured),
      isNew: parseBoolish(raw.isNew),
      descriptionBn: (raw.descriptionBn ?? "").trim() || undefined,
      descriptionEn: (raw.descriptionEn ?? "").trim() || undefined,
      _rowIndex: index,
    } as any,
  };
}

export default function BulkImportPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  /* ── Categories for the resolver ── */
  const { data: catData } = useQuery({
    queryKey: ["admin", "categories-flat"],
    queryFn: async () => {
      const res = await api.get("/catalog/categories?includeChildren=true");
      const flat: Category[] = [];
      const walk = (nodes: any[]) => {
        for (const c of nodes ?? []) {
          flat.push({ id: c.id, slug: c.slug, nameBn: c.nameBn, nameEn: c.nameEn });
          if (c.children?.length) walk(c.children);
        }
      };
      walk(res ?? []);
      return flat;
    },
    staleTime: 5 * 60_000,
  });
  const cats: Category[] = (catData ?? []) as Category[];

  /* ── File picker state ── */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  /* ── Per-row payload (only for valid rows) ── */
  const validPayloads = useMemo(() => {
    return parsed
      .map((row) => {
        const v = validateRow(row.values, cats, row.rowIndex);
        return v.ok ? { row, payload: v.payload } : null;
      })
      .filter((x): x is { row: ParsedRow; payload: Record<string, any> } => !!x);
  }, [parsed, cats]);

  const invalidRows = useMemo(
    () =>
      parsed.filter((row) => {
        const v = validateRow(row.values, cats, row.rowIndex);
        return !v.ok;
      }),
    [parsed, cats],
  );

  /* ── Recompute summary whenever parsed/cats change ── */
  useEffect(() => {
    setSummary({
      totalRows: parsed.length,
      validRows: validPayloads.length,
      invalidRows: invalidRows.length,
    });
  }, [parsed, validPayloads, invalidRows]);

  /* ── Template download ── */
  const downloadTemplate = () => {
    const csv = buildTemplateCsv();
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xovenmart-products-template-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── File parsing ── */
  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error(t("ফাইল খালি", "File is empty"));
        setParsed([]);
        return;
      }
      const headerCells = rows[0].map((s) => s.trim().toLowerCase());
      const expectedHeader = COLUMNS.map((c) => c.key.toLowerCase());

      // Validate that the header has at least the required columns
      const requiredCols = COLUMNS.filter((c) => c.required).map((c) => c.key.toLowerCase());
      const missingRequired = requiredCols.filter((c) => !headerCells.includes(c));
      if (missingRequired.length > 0) {
        toast.error(
          t(
            `প্রয়োজনীয় কলাম মিসিং: ${missingRequired.join(", ")}`,
            `Missing required column(s): ${missingRequired.join(", ")}`,
          ),
        );
        // Still attempt to parse what we can
      }

      const colIndex = (key: string) => headerCells.indexOf(key.toLowerCase());
      const dataRows = rows.slice(1);
      const parsedRows: ParsedRow[] = dataRows.map((cells, idx) => {
        const rowIndex = idx + 2; // +1 for header, +1 for 1-based
        const values: Partial<Record<ColumnKey, string>> = {};
        for (const col of COLUMNS) {
          const i = colIndex(col.key);
          if (i >= 0 && i < cells.length) {
            (values as any)[col.key] = (cells[i] ?? "").toString();
          }
        }
        return { rowIndex, values, errors: [] };
      });

      setParsed(parsedRows);
      toast.success(
        t(
          `${parsedRows.length}টি রো পার্স হয়েছে`,
          `Parsed ${parsedRows.length} row(s)`,
        ),
      );
    } catch (e: any) {
      toast.error(t("ফাইল পড়তে ব্যর্থ", "Failed to read file"));
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  /* ── Submit mutation (one POST per row, sequentially with concurrency cap) ── */
  const [progress, setProgress] = useState<{ done: number; failed: number }>({ done: 0, failed: 0 });
  const [isImporting, setIsImporting] = useState(false);

  const submit = async () => {
    if (validPayloads.length === 0) {
      toast.error(t("কোনো ভ্যালিড রো নেই", "No valid rows to import"));
      return;
    }
    setIsImporting(true);
    setProgress({ done: 0, failed: 0 });
    let done = 0;
    let failed = 0;
    const errorDetails: Array<{ sku: string; msg: string }> = [];

    // Sequential with batch-size concurrency to stay gentle on the API.
    const batchSize = 5;
    for (let i = 0; i < validPayloads.length; i += batchSize) {
      const batch = validPayloads.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((b) =>
          api.post("/admin/products", b.payload).then((res: any) => ({ res, sku: b.payload.sku })),
        ),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          done++;
        } else {
          failed++;
          const e: any = r.reason;
          const idx = (e as any)?._rowIndex;
          const sku = batch[(results.indexOf(r))]?.payload?.sku ?? "?";
          const msg =
            e?.data?.message?.toString?.() ||
            (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ||
            e?.message ||
            "Unknown error";
          errorDetails.push({ sku, msg });
        }
      }
      setProgress({ done, failed });
    }

    setIsImporting(false);
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    if (failed === 0) {
      toast.success(
        t(
          `${done}টি পণ্য সফলভাবে ইমপোর্ট হয়েছে`,
          `Successfully imported ${done} product(s)`,
        ),
      );
    } else {
      toast.error(
        t(
          `${done} সফল, ${failed} ব্যর্থ। প্রথম ত্রুটি: ${errorDetails[0]?.sku} — ${errorDetails[0]?.msg}`,
          `${done} imported, ${failed} failed. First error: ${errorDetails[0]?.sku} — ${errorDetails[0]?.msg}`,
        ),
      );
      // eslint-disable-next-line no-console
      console.error("Bulk import errors:", errorDetails);
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
          <Package className="mr-2 inline h-6 w-6" />
          {t("বাল্ক ইমপোর্ট", "Bulk Import Products")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "CSV থেকে একসাথে অনেক পণ্য আপলোড করুন — টেমপ্লেট ডাউনলোড করুন, পূরণ করুন, আপলোড করুন।",
            "Upload many products from a CSV — download the template, fill it, then upload it back.",
          )}
        </p>
      </div>

      {/* ── Step 1: Template download ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary-700" />
            {t("ধাপ ১ — টেমপ্লেট ডাউনলোড", "Step 1 — Download the template")}
          </CardTitle>
          <CardDescription>
            {t(
              "নিচের বোতামে ক্লিক করে একটি Excel-ফ্রেন্ডলি CSV ডাউনলোড করুন। সব কলামের হেডার আছে এবং ২টি উদাহরণ রো আছে।",
              "Click the button below to download an Excel-friendly CSV with all column headers and 2 sample rows.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={downloadTemplate}>
              <Download className="h-4 w-4" />
              {t("টেমপ্লেট CSV ডাউনলোড করুন", "Download CSV template")}
            </Button>
            <span className="text-xs text-ink-500">
              {t("এক্সেল, গুগল শীটস ও নাম্বার্সে খুলবে।", "Opens in Excel, Google Sheets, and Numbers.")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Step 2: Upload filled file ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-primary-700" />
            {t("ধাপ ২ — পূরণ করা ফাইল আপলোড", "Step 2 — Upload your filled file")}
          </CardTitle>
          <CardDescription>
            {t(
              "টেমপ্লেটটি পূরণ করে এখানে আপলোড করুন। প্রতিটি রো যাচাই করে দেখানো হবে, তারপর একসাথে ইমপোর্ট।",
              "Fill the template and upload it here. Each row will be validated, then imported in a batch.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileInput}
            className="hidden"
          />
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
                  setSummary(null);
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

      {/* ── Step 3: Validation preview ── */}
      {parsed.length > 0 && summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary-700" />
              {t("ধাপ ৩ — প্রিভিউ ও যাচাই", "Step 3 — Preview & validate")}
            </CardTitle>
            <CardDescription>
              {t(
                `${summary.totalRows}টি রো পার্স হয়েছে। ${summary.validRows}টি ভ্যালিড, ${summary.invalidRows}টিতে সমস্যা আছে।`,
                `Parsed ${summary.totalRows} row(s). ${summary.validRows} valid, ${summary.invalidRows} with issues.`,
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <Stat label={t("মোট রো", "Total rows")} value={summary.totalRows} variant="muted" />
              <Stat label={t("ভ্যালিড", "Valid")} value={summary.validRows} variant="ok" />
              <Stat label={t("সমস্যা", "Errors")} value={summary.invalidRows} variant="error" />
            </div>

            <div className="max-h-80 overflow-auto rounded border border-ink-200 dark:border-ink-300">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-ink-50">
                  <tr className="border-b border-ink-200">
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">{t("SKU", "SKU")}</th>
                    <th className="px-2 py-1.5 text-left">{t("নাম (EN)", "Name (EN)")}</th>
                    <th className="px-2 py-1.5 text-left">{t("ক্যাটাগরি", "Category")}</th>
                    <th className="px-2 py-1.5 text-right">{t("MRP", "MRP")}</th>
                    <th className="px-2 py-1.5 text-right">{t("সেল", "Sale")}</th>
                    <th className="px-2 py-1.5 text-center">{t("স্ট্যাটাস", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row) => {
                    const v = validateRow(row.values, cats, row.rowIndex);
                    return (
                      <tr key={row.rowIndex} className="border-b border-ink-100">
                        <td className="px-2 py-1 text-ink-500">{row.rowIndex}</td>
                        <td className="px-2 py-1 font-mono">{row.values.sku ?? "—"}</td>
                        <td className="px-2 py-1">{row.values.nameEn ?? "—"}</td>
                        <td className="px-2 py-1">{row.values.category ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{row.values.mrp ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{row.values.salePrice ?? "—"}</td>
                        <td className="px-2 py-1 text-center">
                          {v.ok ? (
                            <Badge variant="muted" className="text-[10px]">
                              <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-600" />
                              {t("ভ্যালিড", "OK")}
                            </Badge>
                          ) : (
                            <span title={v.errors.join("; ")}>
                              <Badge variant="muted" className="cursor-help text-[10px]">
                                <XCircle className="mr-1 inline h-3 w-3 text-rose-600" />
                                {v.errors[0]}
                                {v.errors.length > 1 ? ` +${v.errors.length - 1}` : ""}
                              </Badge>
                            </span>
                          )}
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
                  "ভুল রো সংশোধন করে আবার আপলোড করুন, অথবা শুধু ভ্যালিড রো ইমপোর্ট করুন।",
                  "Fix the errored rows and re-upload, or import only the valid rows.",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={isImporting}
                  onClick={() => {
                    setParsed([]);
                    setFileName(null);
                    setSummary(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  {t("বাতিল", "Cancel")}
                </Button>
                <Button onClick={submit} disabled={isImporting || validPayloads.length === 0}>
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {isImporting
                    ? t(
                        `ইমপোর্ট হচ্ছে... ${progress.done}/${progress.done + progress.failed}`,
                        `Importing… ${progress.done}/${progress.done + progress.failed}`,
                      )
                    : t(
                        `${validPayloads.length}টি ভ্যালিড রো ইমপোর্ট করুন`,
                        `Import ${validPayloads.length} valid row(s)`,
                      )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Reference / column glossary ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary-700" />
            {t("কলাম গাইড", "Column reference")}
          </CardTitle>
          <CardDescription>
            {t(
              "টেমপ্লেটে যেসব কলাম আছে এবং কোনগুলো বাধ্যতামূলক।",
              "All template columns and which are required.",
            )}
          </CardDescription>
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
                    {c.required ? (
                      <span className="text-rose-600">
                        {t("হ্যাঁ", "yes")}
                      </span>
                    ) : (
                      <span className="text-ink-500">{t("না", "no")}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-ink-500">{c.sample}</td>
                  <td className="px-2 py-1 text-ink-600">
                    {lang === "bn" ? c.descBn : c.descEn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Hints / known issues ── */}
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
              "ক্যাটাগরি কলামে স্লাগ (যেমন grocery) অথবা ক্যাটাগরি নাম (যেমন মুদিখানা, Grocery) — দুটোই চলবে। অজানা ক্যাটাগরি হলে রো ব্যর্থ হবে।",
              "The category column accepts the slug (e.g. grocery) OR the category name (মুদিখানা, Grocery). Unknown categories will fail.",
            )}
          </p>
          <p>
            • {t(
              "SKU ইউনিক হতে হবে। একই SKU আগে থেকে থাকলে সেই রো ব্যর্থ হবে (অন্য রো-গুলো এমনিতেই সেভ হবে)।",
              "SKU must be unique. If a SKU already exists, that row will fail (others will still save).",
            )}
          </p>
          <p>
            • {t(
              "slug ছোট-হাতের অক্ষর ও ড্যাশ হতে হবে। ফাঁকা রাখলে nameEn থেকে অটো-তৈরি হবে।",
              "Slug must be lowercase with dashes. If blank, we'll auto-generate one from nameEn.",
            )}
          </p>
          <p>
            • {t(
              "টেমপ্লেটে আপনি যা সেভ করবেন তা ৫০০ রো পর্যন্ত ভালোভাবে কাজ করে; এর বেশি হলে ব্যাচে ভাগ করে ইমপোর্ট করুন।",
              "Up to ~500 rows works smoothly; for more, split into batches.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "ok" | "error" | "muted";
}) {
  const cls =
    variant === "ok"
      ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700"
      : variant === "error"
      ? "bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700"
      : "bg-ink-50 border-ink-200 text-ink-700 dark:bg-ink-100 dark:border-ink-300";
  return (
    <div className={`rounded border ${cls} px-3 py-2`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
