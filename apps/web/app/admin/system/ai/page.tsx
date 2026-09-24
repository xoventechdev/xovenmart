"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Edit,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Send,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useTheme } from "@/lib/theme";
import { api, extractApiMessage } from "@/lib/api";
import { toast } from "sonner";

/**
 * Admin AI Providers page — `/admin/system/ai`.
 *
 * Mirrors the SMTP page layout: a provider list, an add/edit modal,
 * a "test connection" action, and a "Recent usage" card at the bottom
 * showing the last few `AiUsageEvent` rows so the admin can spot
 * spend / errors without leaving the page.
 *
 * Auth: page is rendered behind the standard admin guard chain in
 * `apps/web/app/admin/layout.tsx`; all endpoints also require ADMIN
 * or MANAGER bearer.
 */

type LlmVendor = "OPENAI" | "ANTHROPIC" | "GEMINI" | "OPENROUTER" | "KIEAI";

interface LlmProvider {
  id: string;
  label: string;
  provider: LlmVendor;
  model: string;
  isActive: boolean;
  isDefault: boolean;
  monthlyUsdCap: string | null;
  appTitle: string | null;
  baseUrl: string | null;
  createdAt: string;
  updatedAt: string;
  // Encrypted columns are returned (cipher is useless without the
  // LLM_ENCRYPTION_KEY) so the form can show "key configured".
  apiKeyCipher: string;
  apiKeyIv: string;
  apiKeyTag: string;
  /** Derived: true when at least one of cipher/iv/tag is non-empty. */
  hasApiKey: boolean;
}

interface AiUsageRow {
  id: string;
  feature: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  estimatedCostUsd: string;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
  createdAt: string;
  provider: { label: string; provider: LlmVendor; model: string } | null;
}

const VENDORS: { value: LlmVendor; label: string; placeholder: string; defaultBaseUrl?: string; docs?: string }[] = [
  { value: "OPENAI",     label: "OpenAI",     placeholder: "gpt-4o-mini",     defaultBaseUrl: "https://api.openai.com/v1",              docs: "platform.openai.com" },
  { value: "ANTHROPIC",  label: "Anthropic",  placeholder: "claude-3-5-haiku-latest", defaultBaseUrl: "https://api.anthropic.com/v1",     docs: "console.anthropic.com" },
  { value: "GEMINI",     label: "Google Gemini", placeholder: "gemini-2.5-flash", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", docs: "aistudio.google.com" },
  { value: "OPENROUTER", label: "OpenRouter", placeholder: "openai/gpt-4o-mini", defaultBaseUrl: "https://openrouter.ai/api/v1",         docs: "openrouter.ai" },
  { value: "KIEAI",      label: "kie.ai",     placeholder: "gpt-4o-mini",     defaultBaseUrl: "https://api.kie.ai/v1",               docs: "kie.ai" },
];

const MODEL_HINTS: Record<LlmVendor, string[]> = {
  OPENAI:     ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
  ANTHROPIC:  ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-haiku-20240307"],
  GEMINI:     ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-1.5"],
  OPENROUTER: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "meta-llama/llama-3.1-70b-instruct"],
  KIEAI:      ["gpt-4o-mini", "claude-3-5-haiku-latest", "gemini-2.5-flash", "meta-llama/llama-3.1-70b-instruct"],
};

/** Suggested baseUrl placeholders shown under the baseUrl input per vendor.
 *  Not exhaustive — admins paste their own gateway / proxy URL. */
const BASE_URL_HINTS: Record<LlmVendor, string[]> = {
  OPENAI:     ["https://api.openai.com/v1", "https://api.groq.com/openai/v1", "https://api.together.xyz/v1"],
  ANTHROPIC:  ["https://api.anthropic.com/v1"],
  GEMINI:     ["https://generativelanguage.googleapis.com/v1beta"],
  OPENROUTER: ["https://openrouter.ai/api/v1"],
  KIEAI:      ["https://api.kie.ai/v1"],
};

/** Backend code → human hint (used in toast descriptions). */
function codeLabel(code: string, lang: "bn" | "en"): string {
  switch (code) {
    case "401":
      return lang === "bn"
        ? "প্রদানকারী API কী গ্রহণ করেনি (401)। সেটিংসে কী যাচাই করুন।"
        : "Provider rejected the API key (401). Check the key in Settings.";
    case "403":
      return lang === "bn"
        ? "অ্যাকাউন্টে মডেলটি চালু নাও থাকতে পারে।"
        : "The model may not be enabled on your account.";
    case "404":
      return lang === "bn"
        ? "মডেল আইডি ভুল — যাচাই করুন।"
        : "Model id is wrong — double-check it.";
    case "429":
      return lang === "bn"
        ? "রেট লিমিট হিট হয়েছে — ১ মিনিট পর আবার চেষ্টা করুন।"
        : "Provider rate-limited (429). Try again in a minute.";
    case "TIMEOUT":
      return lang === "bn"
        ? "প্রদানকারী সময়মতো উত্তর দেয়নি।"
        : "Provider didn't respond in time.";
    case "NETWORK":
      return lang === "bn"
        ? "নেটওয়ার্ক ত্রুটি — সংযোগ যাচাই করুন।"
        : "Network error — check connectivity.";
    case "SCHEMA_INVALID":
      return lang === "bn"
        ? "প্রদানকারী ভুল আউটপুট দিয়েছে — অন্য মডেলে চেষ্টা করুন।"
        : "Provider returned malformed JSON — try a different model.";
    case "NO_PROVIDER_CONFIGURED":
      return lang === "bn"
        ? "কোনো প্রদানকারী কনফিগার করা নেই — নিচে একটি যোগ করুন।"
        : "No provider configured — add one below.";
    case "MONTHLY_CAP_REACHED":
      return lang === "bn"
        ? "মাসিক খরচের সীমা পৌঁছে গেছে — ক্যাপ বাড়ান বা পরের মাসের জন্য অপেক্ষা করুন।"
        : "Monthly spend cap reached — raise it or wait until next month.";
    default:
      return lang === "bn"
        ? "আবার চেষ্টা করুন অথবা API লগ দেখুন।"
        : "Try again or check API logs for the full error.";
  }
}

const emptyProvider = {
  label: "",
  provider: "OPENAI" as LlmVendor,
  model: "",
  apiKey: "",
  monthlyUsdCap: "" as string | number,
  appTitle: "",
  baseUrl: "",
  isActive: true,
  isDefault: false,
};

export default function AiProvidersPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const providersQ = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => api.get<LlmProvider[]>("/admin/ai/providers"),
  });

  const usageQ = useQuery({
    queryKey: ["ai-usage", 20],
    queryFn: () => api.get<AiUsageRow[]>("/admin/ai/usage?limit=20"),
  });

  const providers = providersQ.data ?? [];
  const usage = usageQ.data ?? [];

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LlmProvider | null>(null);
  const [testingFor, setTestingFor] = useState<LlmProvider | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["ai-providers"] });
    qc.invalidateQueries({ queryKey: ["ai-usage"] });
  };

  const setDefault = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: true }>(`/admin/ai/providers/${id}/set-default`, {}),
    onSuccess: () => {
      toast.success(t("ডিফল্ট আপডেট হয়েছে", "Default updated"));
      invalidateAll();
    },
    onError: (e) => toast.error(extractApiMessage(e, "Update failed")),
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/ai/providers/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      invalidateAll();
    },
    onError: (e) => toast.error(extractApiMessage(e, "Delete failed")),
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900">
            <Sparkles className="h-6 w-6 text-primary-700" />
            {t("AI প্রদানকারী", "AI Providers")}
          </h1>
          <p className="text-sm text-ink-500">
            {t(
              "পণ্য কপি তৈরির জন্য ব্যবহৃত LLM প্রদানকারী পরিচালনা করুন।",
              "Manage LLM providers used to generate product copy.",
            )}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("প্রদানকারী যোগ করুন", "Add provider")}
        </Button>
        <Button variant="outline" onClick={() => setBulkOpen(true)}>
          <Sparkles className="mr-2 h-4 w-4" />
          {t("একসাথে যোগ করুন", "Bulk add")}
        </Button>
      </div>

      {/* Default info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            {t("সক্রিয় ডিফল্ট", "Active default")}
          </CardTitle>
          <CardDescription>
            {t(
              "✨ বোতামে এই প্রদানকারী ব্যবহৃত হবে। যেকোনো সারিতে ★ চাপ দিয়ে পরিবর্তন করুন।",
              "The ✨ button uses this provider. Click ★ on any row to change it.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providersQ.isLoading ? (
            <div className="flex items-center gap-2 text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("লোড হচ্ছে...", "Loading...")}
            </div>
          ) : providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-ink-500">
              {t(
                "কোনো প্রদানকারী নেই। যোগ করতে উপরের বোতাম চাপুন — প্রথম প্রদানকারী স্বয়ংক্রিয়ভাবে ডিফল্ট হবে।",
                "No providers yet. Click Add provider — the first one becomes default automatically.",
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {providers.find((p) => p.isDefault) ? (
                <DefaultBadge provider={providers.find((p) => p.isDefault)!} t={t} />
              ) : (
                <span className="text-sm text-ink-500">
                  {t("(কোনো ডিফল্ট নেই — একটি সারিতে ★ চাপ দিন)", "(no default — click ★ on any row)")}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("প্রদানকারী তালিকা", "Providers")} ({providers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {providersQ.isLoading ? (
            <div className="flex items-center gap-2 text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("লোড হচ্ছে...", "Loading...")}
            </div>
          ) : providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-200 p-8 text-center text-ink-500">
              {t(
                "একটি প্রদানকারী যোগ করতে উপরের বোতাম চাপুন।",
                "Click Add provider above to create your first one.",
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onEdit={() => setEditing(p)}
                  onTest={() => setTestingFor(p)}
                  onSetDefault={() => setDefault.mutate(p.id)}
                  onDelete={() => {
                    if (confirm(`Delete provider "${p.label}"?`)) {
                      deleteProvider.mutate(p.id);
                    }
                  }}
                  busy={setDefault.isPending || deleteProvider.isPending}
                  t={t}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent usage */}
      <Card>
        <CardHeader>
          <CardTitle>{t("সাম্প্রতিক ব্যবহার", "Recent usage")}</CardTitle>
          <CardDescription>
            {t(
              "সর্বশেষ ২০টি AI কল। খরচ USD-এ আনুমানিক।",
              "Last 20 AI calls. Costs are approximate, in USD.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageQ.isLoading ? (
            <div className="flex items-center gap-2 text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("লোড হচ্ছে...", "Loading...")}
            </div>
          ) : usage.length === 0 ? (
            <div className="rounded-md border border-dashed border-ink-200 p-6 text-center text-ink-500">
              {t(
                "কোনো ব্যবহার নেই — ✨ বোতাম চেপে প্রথম কলটি করুন।",
                "No usage yet — click the ✨ button to make your first call.",
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                  <tr>
                    <th className="py-2 pr-3">{t("সময়", "When")}</th>
                    <th className="py-2 pr-3">{t("প্রদানকারী", "Provider")}</th>
                    <th className="py-2 pr-3">{t("মডেল", "Model")}</th>
                    <th className="py-2 pr-3">{t("টোকেন", "Tokens")}</th>
                    <th className="py-2 pr-3">{t("খরচ", "Cost")}</th>
                    <th className="py-2 pr-3">{t("ফলাফল", "Result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-300">
                  {usage.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-3 font-mono text-xs text-ink-700">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-ink-900">
                        {row.provider?.label ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <code className="font-mono text-xs text-ink-700">
                          {row.model}
                        </code>
                      </td>
                      <td className="py-2 pr-3 text-ink-700">
                        {row.promptTokens}+{row.outputTokens}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-ink-900">
                        ${Number(row.estimatedCostUsd).toFixed(4)}
                      </td>
                      <td className="py-2 pr-3">
                        {row.ok ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">
                            <CheckCircle2 className="h-3 w-3" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-200">
                            <X className="h-3 w-3" /> {row.errorCode ?? "ERR"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <ProviderForm
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        existing={editing}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          invalidateAll();
        }}
      />

      <TestModal provider={testingFor} onClose={() => setTestingFor(null)} t={t} />

      <BulkAddModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          invalidateAll();
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function DefaultBadge({
  provider,
  t,
}: {
  provider: LlmProvider;
  t: (bn: string, en: string) => string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-sm text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">
      <Star className="h-4 w-4" />
      <span className="font-medium">{provider.label}</span>
      <span className="text-xs opacity-75">· {provider.model}</span>
    </span>
  );
}

function ProviderCard({
  provider,
  onEdit,
  onTest,
  onSetDefault,
  onDelete,
  busy,
  t,
}: {
  provider: LlmProvider;
  onEdit: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  busy?: boolean;
  t: (bn: string, en: string) => string;
}) {
  return (
    <div className="rounded-lg border border-ink-200 p-4 dark:border-ink-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">
              {provider.label}
            </h3>
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
              {provider.provider}
            </span>
            {provider.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                <Star className="h-3 w-3" /> {t("ডিফল্ট", "Default")}
              </span>
            )}
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs " +
                (provider.isActive
                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                  : "bg-gray-200 text-gray-700 dark:bg-ink-300 dark:text-ink-700")
              }
            >
              {provider.isActive ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
              {provider.isActive ? t("সক্রিয়", "Active") : t("নিষ্ক্রিয়", "Inactive")}
            </span>
          </div>
          <div className="mt-1 grid gap-x-4 gap-y-1 text-sm text-ink-600 sm:grid-cols-2">
            <div>
              <span className="text-ink-500">{t("মডেল:", "Model:")}</span>{" "}
              <code className="font-mono text-ink-900">{provider.model}</code>
            </div>
            <div>
              <span className="text-ink-500">{t("API কী:", "API key:")}</span>{" "}
              <code className="font-mono text-ink-900">
                {provider.hasApiKey ? "••••••••" : <span className="text-red-600">({t("কী নেই", "no key")})</span>}
              </code>
            </div>
            <div>
              <span className="text-ink-500">{t("মাসিক ক্যাপ:", "Monthly cap:")}</span>{" "}
              <span className="text-ink-900">
                {provider.monthlyUsdCap
                  ? `$${Number(provider.monthlyUsdCap).toFixed(2)}`
                  : t("সীমাহীন", "Unlimited")}
              </span>
            </div>
            {provider.appTitle && (
              <div>
                <span className="text-ink-500">{t("অ্যাপ টাইটেল:", "App title:")}</span>{" "}
                <span className="text-ink-900">{provider.appTitle}</span>
              </div>
            )}
            {provider.baseUrl && (
              <div className="sm:col-span-2">
                <span className="text-ink-500">{t("Base URL:", "Base URL:")}</span>{" "}
                <code className="font-mono text-ink-900">{provider.baseUrl}</code>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!provider.isDefault && (
            <Button size="sm" variant="outline" onClick={onSetDefault} disabled={busy}>
              <Star className="mr-1 h-3.5 w-3.5" />
              {t("ডিফল্ট", "Default")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onTest}>
            <Send className="mr-1 h-3.5 w-3.5" />
            {t("টেস্ট", "Test")}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit className="mr-1 h-3.5 w-3.5" />
            {t("এডিট", "Edit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            disabled={busy}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t("মুছুন", "Delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProviderForm({
  open,
  onClose,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing: LlmProvider | null;
  onSaved: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [form, setForm] = useState({ ...emptyProvider });
  const [replaceKey, setReplaceKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        label: existing.label,
        provider: existing.provider,
        model: existing.model,
        apiKey: "",
        monthlyUsdCap: existing.monthlyUsdCap ?? "",
        appTitle: existing.appTitle ?? "",
        baseUrl: existing.baseUrl ?? "",
        isActive: existing.isActive,
        isDefault: existing.isDefault,
      });
      setReplaceKey(false);
      setShowKey(false);
    } else {
      setForm({ ...emptyProvider });
      setReplaceKey(false);
      setShowKey(false);
    }
  }, [existing, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        const body: any = {
          label: form.label,
          model: form.model,
          monthlyUsdCap:
            form.monthlyUsdCap === "" ? null : Number(form.monthlyUsdCap),
          appTitle: form.appTitle || null,
          isActive: form.isActive,
        };
        if (replaceKey && form.apiKey) body.apiKey = form.apiKey;
        // baseUrl: null = clear override, string = set, undefined = no change
        body.baseUrl = form.baseUrl === "" ? null : form.baseUrl;
        return api.patch(`/admin/ai/providers/${existing.id}`, body);
      }
      const body: any = {
        label: form.label,
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey,
        isActive: form.isActive,
      };
      if (form.monthlyUsdCap !== "") body.monthlyUsdCap = Number(form.monthlyUsdCap);
      if (form.appTitle) body.appTitle = form.appTitle;
      if (form.baseUrl) body.baseUrl = form.baseUrl;
      return api.post("/admin/ai/providers", body);
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      onSaved();
    },
    onError: (e) => toast.error(extractApiMessage(e, "Save failed")),
  });

  const hints = MODEL_HINTS[form.provider] ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        existing
          ? t("প্রদানকারী এডিট", "Edit provider")
          : t("নতুন প্রদানকারী", "New provider")
      }
      className="max-w-2xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("লেবেল", "Label")} required>
            <Input
              required
              maxLength={64}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t("OpenAI prod", "OpenAI prod")}
            />
          </Field>

          {!existing && (
            <Field label={t("প্রদানকারী", "Vendor")} required>
              <select
                value={form.provider}
                onChange={(e) =>
                  setForm({ ...form, provider: e.target.value as LlmVendor })
                }
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-ink-300 dark:bg-ink-50"
              >
                {VENDORS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label={t("মডেল", "Model")} required>
            <Input
              required
              maxLength={128}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder={VENDORS.find((v) => v.value === form.provider)?.placeholder ?? ""}
              list={`models-${form.provider}`}
            />
            <datalist id={`models-${form.provider}`}>
              {hints.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          <Field
            label={existing ? t("API কী", "API key") : t("API কী", "API key")}
            required={!existing}
          >
            {existing ? (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={form.apiKey}
                    disabled={!replaceKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={replaceKey ? t("নতুন কী পেস্ট করুন", "Paste new key") : "••••••••"}
                  />
                </div>
                <button
                  type="button"
                  className="rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                  onClick={() => setShowKey((s) => !s)}
                  title={showKey ? t("লুকান", "Hide") : t("দেখান", "Show")}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <label className="flex items-center gap-1 text-xs text-ink-600">
                  <input
                    type="checkbox"
                    checked={replaceKey}
                    onChange={(e) => {
                      setReplaceKey(e.target.checked);
                      if (!e.target.checked) setForm({ ...form, apiKey: "" });
                    }}
                  />
                  {t("পরিবর্তন", "Replace")}
                </label>
              </div>
            ) : (
              <div className="relative">
                <Input
                  required
                  type={showKey ? "text" : "password"}
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-... or key-..."
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                  onClick={() => setShowKey((s) => !s)}
                  title={showKey ? t("লুকান", "Hide") : t("দেখান", "Show")}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </Field>

          <Field label={t("মাসিক USD ক্যাপ", "Monthly USD cap")}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.monthlyUsdCap}
              onChange={(e) => setForm({ ...form, monthlyUsdCap: e.target.value })}
              placeholder={t("0 = সীমাহীন", "0 = unlimited")}
            />
          </Field>

          <Field
            label={t("OpenRouter অ্যাপ টাইটেল", "OpenRouter app title")}
          >
            <Input
              maxLength={128}
              value={form.appTitle}
              onChange={(e) => setForm({ ...form, appTitle: e.target.value })}
              placeholder="XovenMart"
              // Attribution headers are only required by OpenRouter.
              // All other vendors (OpenAI / Anthropic / Gemini / kie.ai)
              // ignore this field, so we keep the input disabled to
              // avoid confusing the admin.
              disabled={form.provider !== "OPENROUTER"}
            />
          </Field>

          <Field
            label={t("Base URL (ঐচ্ছিক)", "Base URL (optional)")}
          >
            <Input
              maxLength={500}
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder={
                VENDORS.find((v) => v.value === form.provider)?.defaultBaseUrl ?? ""
              }
              list={`baseurl-${form.provider}`}
            />
            <datalist id={`baseurl-${form.provider}`}>
              {(BASE_URL_HINTS[form.provider] ?? []).map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-ink-500">
              {t(
                "ফাঁকা রাখলে প্রদানকারীর ডিফল্ট এন্ডপয়েন্ট ব্যবহৃত হবে। Azure OpenAI / Groq / Together / llama.cpp এর জন্য এখানে সেই URL দিন।",
                "Leave blank for the vendor's default endpoint. For Azure OpenAI / Groq / Together / llama.cpp gateways, paste that URL here.",
              )}
            </p>
          </Field>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-ink-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {t("সক্রিয়", "Active")}
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function TestModal({
  provider,
  onClose,
  t,
}: {
  provider: LlmProvider | null;
  onClose: () => void;
  t: (bn: string, en: string) => string;
}) {
  const { lang } = useTheme();
  const [result, setResult] = useState<{
    ok: boolean;
    errorCode?: string;
    model: string;
    durationMs: number;
  } | null>(null);

  useEffect(() => {
    setResult(null);
  }, [provider]);

  const run = useMutation({
    mutationFn: async () => {
      if (!provider) return;
      return api.post(`/admin/ai/providers/${provider.id}/test`, {});
    },
    onSuccess: (res: any) => {
      setResult(res);
      if (res?.ok) toast.success(t("সংযোগ সফল", "Connection OK"));
    },
    onError: (e) => {
      const msg = extractApiMessage(e, "Test failed");
      toast.error(msg, { description: codeLabel("UNKNOWN", lang), duration: 6000 });
    },
  });

  return (
    <Modal
      open={provider !== null}
      onClose={onClose}
      title={t("সংযোগ পরীক্ষা", "Test connection")}
    >
      {provider && (
        <div className="space-y-4">
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3 text-sm dark:border-ink-300 dark:bg-ink-100">
            <div className="font-medium text-ink-900">{provider.label}</div>
            <div className="text-ink-600">
              <code className="font-mono">{provider.provider}</code> ·{" "}
              <code className="font-mono">{provider.model}</code>
            </div>
          </div>

          {!result ? (
            <>
              <div className="flex items-center gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  {t(
                    "একটি ছোট পিং কল পাঠানো হবে (সর্বোচ্চ ১৬ টোকেন)।",
                    "A small ping call will be sent (max 16 tokens).",
                  )}
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("বাতিল", "Cancel")}
                </Button>
                <Button onClick={() => run.mutate()} disabled={run.isPending}>
                  {run.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {t("পরীক্ষা চালান", "Run test")}
                </Button>
              </div>
            </>
          ) : (
            <>
              {result.ok ? (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("সফল", "Success")}
                  </div>
                  <div className="mt-1 text-xs">
                    {t("মডেল:", "Model:")} <code className="font-mono">{result.model}</code>{" "}
                    · {result.durationMs} ms
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
                  <div className="flex items-center gap-2 font-medium">
                    <X className="h-4 w-4" />
                    {t("ব্যর্থ", "Failed")} ({result.errorCode})
                  </div>
                  <div className="mt-1 text-xs">
                    {codeLabel(result.errorCode ?? "UNKNOWN", lang)}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-end pt-2">
                <Button variant="outline" onClick={onClose}>
                  {t("বন্ধ", "Close")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * One-click preset rows. Each click appends a pre-filled line to the
 * bulk-add textarea (label | vendor | model | sk-PASTE-HERE | baseUrl).
 * The operator still has to fill the API key — the rest is just
 * "click every chip then paste keys per row".
 *
 * Kept inside BulkAddModal so it has access to the live `bulkText`
 * state setter via the parent.
 */
const BULK_PRESETS: Array<{
  chip: string;
  vendor: LlmVendor;
  model: string;
  defaultBaseUrl?: string;
}> = [
  { chip: "OpenAI (gpt-4o-mini)",    vendor: "OPENAI",     model: "gpt-4o-mini" },
  { chip: "OpenAI (gpt-4.1)",       vendor: "OPENAI",     model: "gpt-4.1" },
  { chip: "OpenAI (gpt-4o)",        vendor: "OPENAI",     model: "gpt-4o" },
  { chip: "OpenAI (o4-mini)",       vendor: "OPENAI",     model: "o4-mini" },
  { chip: "Anthropic (claude-3-5-haiku)", vendor: "ANTHROPIC", model: "claude-3-5-haiku-latest" },
  { chip: "OpenRouter (gpt-4o-mini)", vendor: "OPENROUTER", model: "openai/gpt-4o-mini", defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { chip: "OpenRouter (claude-3.5-haiku)", vendor: "OPENROUTER", model: "anthropic/claude-3.5-haiku", defaultBaseUrl: "https://openrouter.ai/api/v1" },
];

interface BulkResult {
  created: Array<{ index: number; id: string; label: string }>;
  errors: Array<{ index: number; message: string }>;
}

function BulkAddModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [text, setText] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);

  // Reset every time the modal opens so a fresh session doesn't see
  // a stale textarea + stale results from a previous request.
  useEffect(() => {
    if (open) {
      setText("");
      setResult(null);
    }
  }, [open]);

  const appendPreset = (preset: (typeof BULK_PRESETS)[number]) => {
    const defaultLabel = `${preset.vendor === "OPENROUTER" ? "OpenRouter" : preset.vendor.toLowerCase()} ${preset.model}`;
    const baseUrlPart = preset.defaultBaseUrl ? ` | ${preset.defaultBaseUrl}` : "";
    const line = `${defaultLabel} | ${preset.vendor} | ${preset.model} | PASTE-API-KEY-HERE${baseUrlPart}`;
    setText((prev) => (prev.trim().length === 0 ? line : `${prev.trim()}\n${line}`));
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim().length > 0) {
        setText((prev) => (prev.trim().length === 0 ? clip.trim() : `${prev.trim()}\n${clip.trim()}`));
        toast.success(t("ক্লিপবোর্ড থেকে যোগ হয়েছে", "Pasted from clipboard"));
      }
    } catch (e) {
      toast.error(t("ক্লিপবোর্ড পড়া যায়নি — ম্যানুয়াল পেস্ট করুন", "Could not read clipboard — paste manually"));
    }
  };

  /**
   * Parse the textarea line-by-line.
   *
   * Format: `label | vendor | model | apiKey | [optional baseUrl]`
   *   - All 4 required fields separated by ` | ` (pipes with spaces).
   *   - baseUrl is the optional 5th field.
   *   - Blank lines and lines beginning with `#` are ignored.
   *   - Whitespace around each segment is trimmed.
   *   - Returns a fully-shaped CreateLlmProviderDto[] or per-line
   *     parse errors so the user sees "Line 3: missing apiKey" etc.
   */
  const parsed = useMemo(() => {
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
    const items: Array<{ dto: any; displayLabel: string }> = [];
    const parseErrors: Array<{ line: number; message: string }> = [];
    lines.forEach((line, idx) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 4) {
        parseErrors.push({ line: idx + 1, message: t("কমপক্ষে ৪টি ক্ষেত্র দরকার: label | vendor | model | apiKey", "Need at least 4 fields: label | vendor | model | apiKey") });
        return;
      }
      const [label, vendorRaw, model, apiKey, baseUrlOpt] = parts;
      const vendor = vendorRaw.toUpperCase() as LlmVendor;
      const validVendors: LlmVendor[] = ["OPENAI", "ANTHROPIC", "GEMINI", "OPENROUTER", "KIEAI"];
      if (!validVendors.includes(vendor)) {
        parseErrors.push({ line: idx + 1, message: t(`অবৈধ vendor: ${vendorRaw}`, `Invalid vendor: ${vendorRaw}`) });
        return;
      }
      if (label.length < 2 || label.length > 64) {
        parseErrors.push({ line: idx + 1, message: t("label ২-৬৪ অক্ষর হতে হবে", "label must be 2-64 chars") });
        return;
      }
      if (model.length < 2 || model.length > 128) {
        parseErrors.push({ line: idx + 1, message: t("model ২-১২৮ অক্ষর হতে হবে", "model must be 2-128 chars") });
        return;
      }
      if (apiKey.length < 8 || apiKey === "PASTE-API-KEY-HERE") {
        parseErrors.push({ line: idx + 1, message: t("apiKey পেস্ট করা হয়নি", "apiKey not pasted") });
        return;
      }
      const dto: any = { label, vendor, model, apiKey };
      if (baseUrlOpt) dto.baseUrl = baseUrlOpt;
      items.push({ dto, displayLabel: label });
    });
    return { items, parseErrors };
  }, [text, lang]);

  const submit = useMutation({
    mutationFn: async () => {
      return api.post<BulkResult>("/admin/ai/providers/bulk", {
        providers: parsed.items.map((x) => x.dto),
      });
    },
    onSuccess: (res: BulkResult) => {
      setResult(res);
      if (res.errors.length === 0) {
        toast.success(t(`${res.created.length}টি প্রদানকারী যোগ হয়েছে`, `${res.created.length} providers added`));
        setTimeout(() => onDone(), 800);
      } else if (res.created.length === 0) {
        toast.error(t(`কোনো প্রদানকারী যোগ হয়নি — ${res.errors.length}টি ত্রুটি`, `No providers added — ${res.errors.length} errors`));
      } else {
        toast.warning(
          t(
            `${res.created.length}টি যোগ, ${res.errors.length}টি ত্রুটি`,
            `${res.created.length} added, ${res.errors.length} failed`,
          ),
        );
      }
    },
    onError: (e) => toast.error(extractApiMessage(e, "Bulk add failed")),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("একসাথে প্রদানকারী যোগ করুন", "Bulk add providers")}
      className="max-w-3xl"
    >
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            {t(
              "প্রতি লাইনে একটি প্রদানকারী: label | vendor | model | apiKey | [optional baseUrl]",
              "One provider per line: label | vendor | model | apiKey | [optional baseUrl]",
            )}
          </p>

          {/* Preset chips — one click adds a placeholder row. */}
          <div className="flex flex-wrap gap-2">
            {BULK_PRESETS.map((p) => (
              <button
                key={p.chip}
                type="button"
                onClick={() => appendPreset(p)}
                className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-700 hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:bg-ink-100 dark:hover:bg-primary-900/30"
              >
                <Plus className="mr-1 inline-block h-3 w-3" />
                {p.chip}
              </button>
            ))}
            <button
              type="button"
              onClick={pasteFromClipboard}
              className="rounded-full border border-dashed border-ink-300 px-3 py-1 text-xs text-ink-600 hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:hover:bg-primary-900/30"
            >
              {t("ক্লিপবোর্ড থেকে পেস্ট", "Paste from clipboard")}
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="block h-48 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs focus:border-primary-500 focus:outline-none dark:border-ink-300 dark:bg-ink-50"
            placeholder={"OpenAI prod | OPENAI | gpt-4o-mini | sk-xxxx | https://api.openai.com/v1\nGemini fallback | GEMINI | gemini-2.5-flash | AIzaSyxxxx"}
          />

          {/* Live parse summary so the operator sees what's wrong before submitting. */}
          <div className="text-xs text-ink-600">
            {parsed.items.length > 0 ? (
              <span className="text-green-700 dark:text-green-300">
                {t(`${parsed.items.length}টি প্রস্তুত`, `${parsed.items.length} ready`)}
              </span>
            ) : null}
            {parsed.parseErrors.length > 0 ? (
              <span className="ml-3 text-red-700 dark:text-red-300">
                {t(`${parsed.parseErrors.length}টি ত্রুটি`, `${parsed.parseErrors.length} parse errors`)}
              </span>
            ) : null}
            {parsed.items.length === 0 && parsed.parseErrors.length === 0 ? (
              <span className="text-ink-500">
                {t("উপরের বোতাম চাপ দিয়ে শুরু করুন অথবা সরাসরি টাইপ করুন", "Click a chip above or type your rows directly")}
              </span>
            ) : null}
          </div>

          {parsed.parseErrors.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200">
              {parsed.parseErrors.map((e, i) => (
                <div key={i}>
                  {t(`লাইন ${e.line}:`, `Line ${e.line}:`)} {e.message}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("বাতিল", "Cancel")}
            </Button>
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || parsed.items.length === 0}
            >
              {submit.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {t(`${parsed.items.length}টি যোগ করুন`, `Add ${parsed.items.length}`)}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-ink-200 p-3 dark:border-ink-300">
            <div className="text-sm font-medium text-ink-900">
              {t(
                `${result.created.length}টি যোগ হয়েছে`,
                `${result.created.length} created`,
              )}
            </div>
            {result.created.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-700">
                {result.created.map((c) => (
                  <li key={c.id}>
                    <CheckCircle2 className="mr-1 inline h-3 w-3 text-green-600" />
                    #{c.index + 1} · {c.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
              <div className="text-sm font-medium text-red-800 dark:text-red-200">
                {t(`${result.errors.length}টি ত্রুটি`, `${result.errors.length} failed`)}
              </div>
              <ul className="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <X className="mr-1 inline h-3 w-3" />
                    #{e.index + 1} · {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onDone}>
              {t("বন্ধ", "Close")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
