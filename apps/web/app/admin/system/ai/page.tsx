"use client";

import { useEffect, useState } from "react";
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

type LlmVendor = "OPENAI" | "ANTHROPIC" | "GEMINI" | "OPENROUTER";

interface LlmProvider {
  id: string;
  label: string;
  provider: LlmVendor;
  model: string;
  isActive: boolean;
  isDefault: boolean;
  monthlyUsdCap: string | null;
  appTitle: string | null;
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

const VENDORS: { value: LlmVendor; label: string; placeholder: string; docs?: string }[] = [
  { value: "OPENAI",     label: "OpenAI",     placeholder: "gpt-4o-mini",     docs: "platform.openai.com" },
  { value: "ANTHROPIC",  label: "Anthropic",  placeholder: "claude-3-5-haiku-latest", docs: "console.anthropic.com" },
  { value: "GEMINI",     label: "Google Gemini", placeholder: "gemini-2.5-flash", docs: "aistudio.google.com" },
  { value: "OPENROUTER", label: "OpenRouter", placeholder: "openai/gpt-4o-mini", docs: "openrouter.ai" },
];

const MODEL_HINTS: Record<LlmVendor, string[]> = {
  OPENAI:     ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
  ANTHROPIC:  ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest", "claude-3-haiku-20240307"],
  GEMINI:     ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-1.5"],
  OPENROUTER: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "meta-llama/llama-3.1-70b-instruct"],
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
              disabled={form.provider !== "OPENROUTER"}
            />
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
