"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Languages,
  Search,
  Plus,
  Trash2,
  Save,
  Download,
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileJson,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Locale = "bn" | "en";

interface TranslationRow {
  key: string;
  locale: Locale;
  value: string;
  updatedBy?: string | null;
  updatedAt: string;
  createdAt: string;
}

interface ListResponse {
  items: TranslationRow[];
  total: number;
  page: number;
  perPage: number;
  locale: Locale;
}

interface Coverage {
  totalDistinctKeys: number;
  bnCount: number;
  enCount: number;
  bnMissingInLocale: number;
  enMissingInLocale: number;
}

export default function AdminTranslationsPage() {
  const { lang } = useTheme();
  const { invalidate } = useI18n();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [locale, setLocale] = useState<Locale>("bn");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Debounce search input so we don't refetch on every keystroke
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(h);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [locale, debouncedSearch]);

  // List
  const listQ = useQuery({
    queryKey: ["admin", "translations", "list", locale, debouncedSearch, page],
    queryFn: () =>
      api.get<ListResponse>(
        `/admin/translations?locale=${locale}&q=${encodeURIComponent(debouncedSearch)}&page=${page}`,
      ),
  });

  // Coverage stats (don't depend on search — global)
  const covQ = useQuery({
    queryKey: ["admin", "translations", "coverage"],
    queryFn: () => api.get<Coverage>("/admin/translations/coverage"),
  });

  // Audit log strip (latest edits)
  const auditQ = useQuery({
    queryKey: ["admin", "audit", "translation"],
    queryFn: () =>
      api
        .get<{ items: Array<{ id: string; action: string; createdAt: string; actorId: string; entityId: string }> }>(
          "/admin/audit/logs?entity=translation&limit=5",
        )
        .catch(() => ({ items: [] })),
  });

  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const perPage = listQ.data?.perPage ?? 200;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const selected = useMemo(
    () => items.find((it) => it.key === selectedKey) ?? null,
    [items, selectedKey],
  );

  // Fetch both locales for the selected key so we can show side-by-side editing
  const pairQ = useQuery({
    queryKey: ["admin", "translations", "pair", selectedKey],
    queryFn: async () => {
      if (!selectedKey) return { bn: null as TranslationRow | null, en: null as TranslationRow | null };
      const [bnRes, enRes] = await Promise.all([
        api
          .get<ListResponse>(`/admin/translations?locale=bn&q=${encodeURIComponent(selectedKey)}&page=1`)
          .catch(() => null),
        api
          .get<ListResponse>(`/admin/translations?locale=en&q=${encodeURIComponent(selectedKey)}&page=1`)
          .catch(() => null),
      ]);
      const exactBn = (bnRes?.items ?? []).find((i) => i.key === selectedKey) ?? null;
      const exactEn = (enRes?.items ?? []).find((i) => i.key === selectedKey) ?? null;
      return { bn: exactBn, en: exactEn };
    },
    enabled: !!selectedKey,
  });

  // Edit form state
  const [editBn, setEditBn] = useState("");
  const [editEn, setEditEn] = useState("");
  useEffect(() => {
    setEditBn(pairQ.data?.bn?.value ?? "");
    setEditEn(pairQ.data?.en?.value ?? "");
  }, [pairQ.data?.bn?.key, pairQ.data?.en?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedKey) return;
      const ops: Promise<any>[] = [];
      if (editBn.trim().length > 0) {
        ops.push(
          api.put("/admin/translations", {
            key: selectedKey,
            locale: "bn",
            value: editBn,
          }),
        );
      }
      if (editEn.trim().length > 0) {
        ops.push(
          api.put("/admin/translations", {
            key: selectedKey,
            locale: "en",
            value: editEn,
          }),
        );
      }
      await Promise.all(ops);
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত হয়েছে", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "translations"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit", "translation"] });
      // Force the public bundle to refresh on next page load:
      try {
        localStorage.removeItem(`xm-i18n-bn`);
        localStorage.removeItem(`xm-i18n-en`);
      } catch {}
      invalidate();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("সংরক্ষণ ব্যর্থ", "Save failed")),
  });

  const removeOne = useMutation({
    mutationFn: (vars: { key: string; locale: Locale }) =>
      api.delete(`/admin/translations/${encodeURIComponent(vars.key)}/${vars.locale}`),
    onSuccess: (_, vars) => {
      toast.success(t("মুছে �েলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "translations"] });
      qc.invalidateQueries({ queryKey: ["admin", "audit", "translation"] });
      try {
        localStorage.removeItem(`xm-i18n-${vars.locale}`);
      } catch {}
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("মুছতে ব্যর্থ", "Delete failed")),
  });

  const exportBundle = useMutation({
    mutationFn: async (l: Locale) => {
      const res = await api.get<{
        locale: Locale;
        translations: Record<string, string>;
        count: number;
        exportedAt: string;
      }>(`/admin/translations/export?locale=${l}`);
      const blob = new Blob([JSON.stringify(res.translations, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xovenmart-${l}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return res;
    },
    onSuccess: (res) =>
      toast.success(
        t(`${res.count}টি অনুবাদ এক্সপোর্ট হয়েছে`, `Exported ${res.count} translations`),
      ),
    onError: () => toast.error(t("এক্সপোর্ট ব্যর্�", "Export failed")),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900 dark:text-ink-50">
            <Languages className="h-6 w-6" />
            {t("অনুবাদ ম্যানেজমেন্ট", "Translation Management")}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
            {t(
              "DB-ব্যাকড অনুবাদ। ইনলাইন t() কলগুলো ফলব্যাক হিসেবে কাজ করে।",
              "DB-backed translations. Inline t() calls still serve as fallback.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportBundle.mutate(locale)}
            disabled={exportBundle.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            {t("JSON এক্সপোর্ট", "Export JSON")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("JSON ইমপোর্ট", "Import JSON")}
          </Button>
          <Button variant="outline" onClick={() => setShowBulkModal(true)}>
            <FileJson className="mr-2 h-4 w-4" />
            {t("বাল্ক", "Bulk")}
          </Button>
          <Button onClick={() => setShowNewModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("নতুন কী", "New Key")}
          </Button>
        </div>
      </div>

      {/* Coverage stats */}
      {covQ.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label={t("মোট কী", "Total Keys")}
            value={String(covQ.data.totalDistinctKeys)}
            tone="default"
          />
          <StatCard
            label={t("বাংলা রো", "BN Rows")}
            value={String(covQ.data.bnCount)}
            tone={covQ.data.bnCount === 0 ? "danger" : "ok"}
          />
          <StatCard
            label={t("ইংরেজি রো", "EN Rows")}
            value={String(covQ.data.enCount)}
            tone={covQ.data.enCount === 0 ? "danger" : "ok"}
          />
          <StatCard
            label={t("কভারেজ গ্যা�", "Coverage Gap")}
            value={String(
              locale === "bn" ? covQ.data.bnMissingInLocale : covQ.data.enMissingInLocale,
            )}
            tone={
              (locale === "bn" ? covQ.data.bnMissingInLocale : covQ.data.enMissingInLocale) > 0
                ? "warn"
                : "ok"
            }
          />
        </div>
      )}

      {/* Locale tabs + search */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex rounded-md border border-ink-200 dark:border-ink-300">
            {(["bn", "en"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  locale === l
                    ? "bg-primary-700 text-white"
                    : "bg-white text-ink-700 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-ink-800"
                } ${l === "bn" ? "rounded-l-md" : "rounded-r-md border-l border-ink-200 dark:border-ink-300"}`}
              >
                {l === "bn" ? "🇧🇩 বাংলা" : "🇬� English"}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              placeholder={t("কী খুঁজুন (যেমন: checkout.title)", "Search keys (e.g. checkout.title)")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="muted">
            {total} {t("টি", "rows")}
          </Badge>
        </CardContent>
      </Card>

      {/* Main two-pane */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(360px,2fr)]">
        {/* List */}
        <Card className="max-h-[70vh] overflow-hidden">
          <CardHeader className="border-b border-ink-100 px-4 py-3 dark:border-ink-300">
            <CardTitle className="text-sm">
              {t("কী তালিকা", "Keys")} {locale === "bn" ? "�🇩" : "🇬🇧"}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[60vh] overflow-y-auto p-0">
            {listQ.isLoading && (
              <div className="flex items-center justify-center p-8 text-ink-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!listQ.isLoading && items.length === 0 && (
              <div className="p-8 text-center text-sm text-ink-400">
                {t("কোনো কী নেই", "No keys found")}
              </div>
            )}
            {items.map((it) => (
              <button
                key={it.key + ":" + it.locale}
                onClick={() => setSelectedKey(it.key)}
                className={`block w-full border-b border-ink-100 px-4 py-2.5 text-left text-sm transition-colors hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-800 ${
                  selectedKey === it.key
                    ? "bg-primary-50 dark:bg-primary-900/30"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-ink-700 dark:text-ink-200">
                    {it.key}
                  </span>
                  <span className="shrink-0 text-[10px] text-ink-400">
                    {new Date(it.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-300">
                  {it.value || <em className="text-danger-500">{t("�ালি", "empty")}</em>}
                </div>
              </button>
            ))}
          </CardContent>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2 dark:border-ink-300">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t("আগে", "Prev")}
              </Button>
              <span className="text-xs text-ink-500">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("পরে", "Next")}
              </Button>
            </div>
          )}
        </Card>

        {/* Editor */}
        <Card>
          <CardHeader className="border-b border-ink-100 px-4 py-3 dark:border-ink-300">
            <CardTitle className="text-sm">
              {selectedKey ? (
                <span className="font-mono">{selectedKey}</span>
              ) : (
                <span className="text-ink-400">
                  {t("এ�িট করতে একটি কী নির্বাচন করুন", "Select a key to edit")}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {!selectedKey && (
              <div className="flex h-48 items-center justify-center text-center text-sm text-ink-400">
                <div>
                  <Languages className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  {t(
                    "বাম দিক থেকে একটি অনুবাদ কী নির্বাচন করুন",
                    "Pick a translation key from the left",
                  )}
                </div>
              </div>
            )}
            {selectedKey && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-500">
                    🇧🇩 বাংলা
                  </label>
                  <textarea
                    className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-900 dark:text-ink-50"
                    rows={3}
                    value={editBn}
                    onChange={(e) => setEditBn(e.target.value)}
                    placeholder="বাংলা অনুবাদ..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-500">
                    🇬🇧 English
                  </label>
                  <textarea
                    className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-900 dark:text-ink-50"
                    rows={3}
                    value={editEn}
                    onChange={(e) => setEditEn(e.target.value)}
                    placeholder="English translation..."
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-ink-400">
                    {pairQ.data?.bn?.updatedAt && (
                      <span>
                        BN {t("আপডেট", "updated")}:{" "}
                        {new Date(pairQ.data.bn.updatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            t(
                              `এই কী মুছে ফেলবেন? (উভয় লোকেল)`,
                              `Delete this key? (both locales)`,
                            ),
                          )
                        ) {
                          removeOne.mutate({ key: selectedKey, locale: "bn" });
                          removeOne.mutate({ key: selectedKey, locale: "en" });
                          setSelectedKey(null);
                        }
                      }}
                      className="text-danger-600"
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {t("মুছুন", "Delete")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => save.mutate()}
                      disabled={save.isPending}
                    >
                      <Save className="mr-1 h-4 w-4" />
                      {t("সংরক্ষণ", "Save")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Audit strip */}
      <Card>
        <CardHeader className="border-b border-ink-100 px-4 py-3 dark:border-ink-300">
          <CardTitle className="text-sm">
            {t("সাম্প্রতিক অডিট", "Recent Audit")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!auditQ.data || (auditQ.data.items ?? []).length === 0) && (
            <div className="p-4 text-center text-sm text-ink-400">
              {t("কোনো অডিট নেই", "No audit entries yet")}
            </div>
          )}
          {(auditQ.data?.items ?? []).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between border-b border-ink-100 px-4 py-2 text-xs last:border-b-0 dark:border-ink-300"
            >
              <span className="font-mono text-ink-700 dark:text-ink-200">
                {a.entityId}
              </span>
              <Badge variant="muted">{a.action}</Badge>
              <span className="text-ink-400">
                {new Date(a.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* New key modal */}
      {showNewModal && (
        <NewKeyModal
          locale={locale}
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            qc.invalidateQueries({ queryKey: ["admin", "translations"] });
            qc.invalidateQueries({ queryKey: ["admin", "translations", "coverage"] });
          }}
        />
      )}

      {/* Bulk upsert modal */}
      {showBulkModal && (
        <BulkModal
          defaultLocale={locale}
          onClose={() => setShowBulkModal(false)}
          onSaved={() => {
            setShowBulkModal(false);
            qc.invalidateQueries({ queryKey: ["admin", "translations"] });
            qc.invalidateQueries({ queryKey: ["admin", "translations", "coverage"] });
          }}
        />
      )}

      {/* Import modal */}
      {showImportModal && (
        <ImportModal
          defaultLocale={locale}
          onClose={() => setShowImportModal(false)}
          onSaved={() => {
            setShowImportModal(false);
            qc.invalidateQueries({ queryKey: ["admin", "translations"] });
            qc.invalidateQueries({ queryKey: ["admin", "translations", "coverage"] });
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "ok" | "warn" | "danger";
}) {
  const tones = {
    default: "border-ink-200 dark:border-ink-300",
    ok: "border-green-200 bg-green-50/50 dark:border-green-700 dark:bg-green-900/20",
    warn: "border-amber-200 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/20",
    danger: "border-red-200 bg-red-50/50 dark:border-red-700 dark:bg-red-900/20",
  };
  const valueTones = {
    default: "text-ink-900 dark:text-ink-50",
    ok: "text-green-700 dark:text-green-300",
    warn: "text-amber-700 dark:text-amber-300",
    danger: "text-red-700 dark:text-red-300",
  };
  return (
    <Card className={tones[tone]}>
      <CardContent className="p-3">
        <div className="text-xs text-ink-500 dark:text-ink-300">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${valueTones[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function NewKeyModal({
  locale,
  onClose,
  onSaved,
}: {
  locale: Locale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [key, setKey] = useState("");
  const [bn, setBn] = useState("");
  const [en, setEn] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!key.trim()) throw new Error("key required");
      if (bn.trim()) {
        await api.put("/admin/translations", { key: key.trim(), locale: "bn", value: bn });
      }
      if (en.trim()) {
        await api.put("/admin/translations", { key: key.trim(), locale: "en", value: en });
      }
    },
    onSuccess: () => {
      toast.success(t("তৈরি হয়েছে", "Created"));
      onSaved();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? e?.message ?? t("ব্যর্থ", "Failed")),
  });

  return (
    <ModalShell title={t("নতুন অনুবাদ কী", "New Translation Key")} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">
            {t("কী (dotted path)", "Key (dotted path)")}
          </label>
          <Input
            placeholder="checkout.title"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">
            🇧🇩 বাংলা
          </label>
          <textarea
            rows={2}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-900 dark:text-ink-50"
            value={bn}
            onChange={(e) => setBn(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">
            🇬🇧 English
          </label>
          <textarea
            rows={2}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-900 dark:text-ink-50"
            value={en}
            onChange={(e) => setEn(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!key.trim() || save.isPending}>
            <Save className="mr-1 h-4 w-4" />
            {t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function BulkModal({
  defaultLocale,
  onClose,
  onSaved,
}: {
  defaultLocale: Locale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ updated: number; errors: number } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      // Accept JSON array of {key, locale?, value} or {key, value} (uses default locale)
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed)
        ? parsed.map((r: any) => ({
            key: String(r.key ?? "").trim(),
            locale: (r.locale ?? locale) as Locale,
            value: String(r.value ?? ""),
          }))
        : Object.entries(parsed as Record<string, string>).map(([k, v]) => ({
            key: k,
            locale,
            value: String(v),
          }));
      const res = await api.post<{ ok: boolean; requested: number; updated: number; errors: any[] }>(
        "/admin/translations/bulk",
        { rows },
      );
      setResult({ updated: res.updated, errors: res.errors?.length ?? 0 });
      return res;
    },
    onSuccess: () => {
      toast.success(t("বাল্ক সংরক্ষণ হয়েছে", "Bulk saved"));
      onSaved();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? e?.message ?? t("পার্স ব্যর্থ", "Parse failed")),
  });

  return (
    <ModalShell title={t("বাল্ক আপসার্ট", "Bulk Upsert")} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-500">{t("ডিফল্ট লোকেল", "Default locale")}:</span>
          {(["bn", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`rounded-md px-3 py-1 text-xs ${
                locale === l
                  ? "bg-primary-700 text-white"
                  : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <textarea
          rows={12}
          placeholder={`Paste JSON array, e.g.\n[\n  { "key": "checkout.title", "locale": "bn", "value": "চেকআউট" },\n  { "key": "checkout.title", "locale": "en", "value": "Checkout" }\n]\n\n...or a flat key→value object (uses default locale).`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs dark:border-ink-300 dark:bg-ink-900 dark:text-ink-50"
        />
        {result && (
          <div className="rounded-md bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800">
            {t("আপডেট", "Updated")}: <b>{result.updated}</b> ·{" "}
            {t("ত্রুটি", "Errors")}: <b className={result.errors > 0 ? "text-red-600" : ""}>{result.errors}</b>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("বন্ধ", "Close")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!text.trim() || save.isPending}>
            <Upload className="mr-1 h-4 w-4" />
            {t("আপলোড ও সংরক্�ণ", "Upload & Save")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function ImportModal({
  defaultLocale,
  onClose,
  onSaved,
}: {
  defaultLocale: Locale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ updated: number } | null>(null);

  const onFile = async (file: File) => {
    const txt = await file.text();
    setText(txt);
  };

  const save = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(text);
      // Accept flat key→value object OR array of {key,value}
      let rows: Array<{ key: string; value: string }> = [];
      if (Array.isArray(parsed)) {
        rows = parsed.map((r: any) => ({ key: String(r.key ?? "").trim(), value: String(r.value ?? "") }));
      } else if (typeof parsed === "object" && parsed) {
        rows = Object.entries(parsed).map(([k, v]) => ({ key: String(k).trim(), value: String(v) }));
      }
      const res = await api.post<{ ok: boolean; updated: number }>(
        "/admin/translations/import",
        { locale, rows },
      );
      setResult({ updated: res.updated });
      return res;
    },
    onSuccess: () => {
      toast.success(t("ইমপোর্ট সফল", "Imported"));
      onSaved();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? e?.message ?? t("পার্স ব্যর্থ", "Parse failed")),
  });

  return (
    <ModalShell title={t("JSON ইমপোর্ট", "Import JSON Bundle")} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-500">{t("লোকেল", "Locale")}:</span>
          {(["bn", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`rounded-md px-3 py-1 text-xs ${
                locale === l
                  ? "bg-primary-700 text-white"
                  : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary-700 file:px-3 file:py-1.5 file:text-white"
        />
        <textarea
          rows={10}
          placeholder='{ "checkout.title": "Checkout", "cart.empty": "Your cart is empty" }'
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs dark:border-ink-300 dark:bg-ink-900 dark:text-ink-50"
        />
        {result && (
          <div className="rounded-md bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800">
            {t("আপডেট", "Updated")}: <b>{result.updated}</b>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("বন্�", "Close")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!text.trim() || save.isPending}>
            <Upload className="mr-1 h-4 w-4" />
            {t("ইমপোর্ট", "Import")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-xl bg-white p-5 shadow-xl dark:bg-ink-900 ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
