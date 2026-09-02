"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Edit,
  Loader2,
  Mail,
  MailQuestion,
  Plus,
  Save,
  Send,
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

type SmtpEncryption = "NONE" | "STARTTLS" | "TLS";
type EmailPurpose = "AUTH" | "ORDERS" | "BACKUPS" | "MARKETING";

interface SmtpProvider {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  fromAddress: string;
  fromName: string;
  encryption: SmtpEncryption;
  rejectUnauthorized: boolean;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  hasPassword: boolean; // server strips the encrypted columns
}

interface PurposesResponse {
  default: { providerId: string; label: string } | null;
  purposes: Record<
    EmailPurpose,
    { providerId: string; providerLabel: string } | null
  >;
}

const PURPOSES: { key: EmailPurpose; labelBn: string; labelEn: string }[] = [
  { key: "AUTH",      labelBn: "অথ (OTP / পাসওয়ার্ড)", labelEn: "Auth (OTP / Password)" },
  { key: "ORDERS",    labelBn: "অর্ডার আপডেট",         labelEn: "Order Updates" },
  { key: "BACKUPS",   labelBn: "ব্যাকআপ নোটিফিকেশন", labelEn: "Backup Notifications" },
  { key: "MARKETING", labelBn: "মার্কেটিং",            labelEn: "Marketing (optional)" },
];

const ENCRYPTIONS: { value: SmtpEncryption; label: string }[] = [
  { value: "STARTTLS", label: "STARTTLS (port 587)" },
  { value: "TLS",      label: "TLS / Implicit (port 465)" },
  { value: "NONE",     label: "None (port 25 — local only)" },
];

/**
 * Human-readable hint for each SMTP errorCode the backend returns, shown
 * beneath the toast so the admin has an action item, not just an error.
 */
function codeLabel(code: string, lang: "bn" | "en"): string {
  switch (code) {
    case "auth_failed":
      return lang === "bn"
        ? "সার্ভার ইউজারনেম বা অ্যাপ পাসওয়ার্ড আবার যাচাই করুন।"
        : "Verify the SMTP username and (app) password.";
    case "connection_refused":
      return lang === "bn"
        ? "হোস্ট ও পোর্ট (৫৮৭/৪৬৫/২৫) যাচাই করুন, আউটবাউন্ড ট্রাফিক চালু আছে কিনা দেখুন।"
        : "Check host + port (587/465/25) and that your network allows outbound traffic.";
    case "dns_not_found":
      return lang === "bn"
        ? "হোস্টনেমটি রিজলভ হচ্ছে না — টাইপো আছে কিনা দেখুন।"
        : "Hostname didn't resolve — check for typos.";
    case "tls_failed":
      return lang === "bn"
        ? "TLS হাত ব্যর্থ। স্ব-স্বাক্ষরিত সার্টিফিকেট হলে 'Verify TLS' বন্ধ করে দেখুন।"
        : "If the server uses a self-signed certificate, turn off 'Verify TLS' for this provider.";
    case "timeout":
      return lang === "bn"
        ? "সার্ভার সময়মতো উত্তর দিচ্ছে না।"
        : "The server didn't respond in time.";
    case "decrypt_failed":
      return lang === "bn"
        ? "SMTP_ENCRYPTION_KEY পরিবর্তিত হয়ে থাকতে পারে — পাসওয়ার্ড নতুন করে সেভ করুন।"
        : "SMTP_ENCRYPTION_KEY may have been rotated — re-save the password.";
    default:
      return lang === "bn"
        ? "বিস্তারিত জানতে API লগ দেখুন।"
        : "Check API logs for the full error.";
  }
}

const emptyProvider = {
  label: "",
  host: "",
  port: 587,
  user: "",
  pass: "",
  fromAddress: "",
  fromName: "XovenMart",
  encryption: "STARTTLS" as SmtpEncryption,
  rejectUnauthorized: true,
  isActive: true,
};

export default function SmtpPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  // Providers list
  const providersQ = useQuery({
    queryKey: ["smtp-providers"],
    queryFn: () => api.get<SmtpProvider[]>("/admin/system/smtp/providers"),
  });

  // Purposes + default
  const purposesQ = useQuery({
    queryKey: ["smtp-purposes"],
    queryFn: () => api.get<PurposesResponse>("/admin/system/smtp/purposes"),
  });

  const providers = providersQ.data ?? [];
  const purposes = purposesQ.data;

  // ─── Modals ──────────────────────────────────────────────
  const [editing, setEditing] = useState<SmtpProvider | null>(null);
  const [creating, setCreating] = useState(false);
  const [testingFor, setTestingFor] = useState<SmtpProvider | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["smtp-providers"] });
    qc.invalidateQueries({ queryKey: ["smtp-purposes"] });
  };

  // ─── Mutations ──────────────────────────────────────────────
  const setDefault = useMutation({
    mutationFn: (body: { providerId: string }) =>
      api.patch<{ ok: true; defaultId: string }>("/admin/system/smtp/default", body),
    onSuccess: () => {
      toast.success(t("ডিফল্ট আপডেট হয়েছে", "Default updated"));
      invalidateAll();
    },
    onError: (e) => toast.error(extractApiMessage(e, "Update failed")),
  });

  const assignPurpose = useMutation({
    mutationFn: (body: { purpose: EmailPurpose; providerId: string | null }) =>
      api.patch("/admin/system/smtp/purposes", body),
    onSuccess: () => {
      toast.success(t("পারপাস আপডেট হয়েছে", "Purpose assignment updated"));
      invalidateAll();
    },
    onError: (e) => toast.error(extractApiMessage(e, "Update failed")),
  });

  const deleteProvider = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.delete(`/admin/system/smtp/providers/${id}`),
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
          <h1 className="text-2xl font-semibold text-ink-900">
            {t("SMTP কনফিগারেশন", "SMTP Configuration")}
          </h1>
          <p className="text-sm text-ink-500">
            {t(
              "ইমেইল প্রদানকারী পরিচালনা করুন (অথ, অর্ডার, ব্যাকআপ ইত্যাদি)",
              "Manage email providers used for auth, orders, backups, and more.",
            )}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("প্রদানকারী যোগ করুন", "Add provider")}
        </Button>
      </div>

      {/* Default + purpose assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            {t("ডিফল্ট ও পারপাস ম্যাপিং", "Default & purpose mapping")}
          </CardTitle>
          <CardDescription>
            {t(
              "প্রতিটি পারপাসের জন্য প্রদানকারী বেছে নিন। খালি রাখলে ডিফল্ট ব্যবহৃত হবে।",
              "Pick which provider handles each purpose. Empty falls back to the default.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ink-700">
              {t("ডিফল্ট:", "Default:")}
            </span>
            <DefaultPicker
              providers={providers}
              current={purposes?.default?.providerId ?? null}
              onChange={(id) => setDefault.mutate({ providerId: id })}
              disabled={setDefault.isPending}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {PURPOSES.map((p) => (
              <PurposeRow
                key={p.key}
                purpose={p.key}
                label={t(p.labelBn, p.labelEn)}
                providers={providers}
                current={
                  purposes?.purposes?.[p.key]
                    ? purposes.purposes[p.key]!.providerId
                    : null
                }
                disabled={assignPurpose.isPending}
                onChange={(providerId) =>
                  assignPurpose.mutate({ purpose: p.key, providerId })
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Provider list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
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
                "কোনো প্রদানকারী নেই — যোগ করতে উপরের বোতাম চাপুন।",
                "No providers yet — click Add provider to create your first one.",
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
                  onDelete={() => {
                    if (confirm(`Delete provider "${p.label}"?`)) {
                      deleteProvider.mutate({ id: p.id });
                    }
                  }}
                  deleting={deleteProvider.isPending}
                />
              ))}
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

      <TestModal
        provider={testingFor}
        onClose={() => setTestingFor(null)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function DefaultPicker({
  providers,
  current,
  onChange,
  disabled,
}: {
  providers: SmtpProvider[];
  current: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={current ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || providers.length === 0}
      className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-900 focus:border-primary-500 focus:outline-none disabled:opacity-50 dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
    >
      <option value="">{providers.length === 0 ? "—" : "(none)"}</option>
      {providers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label} — {p.host}:{p.port}
        </option>
      ))}
    </select>
  );
}

function PurposeRow({
  purpose,
  label,
  providers,
  current,
  onChange,
  disabled,
}: {
  purpose: EmailPurpose;
  label: string;
  providers: SmtpProvider[];
  current: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-ink-200 px-3 py-2 dark:border-ink-300">
      <div>
        <div className="text-sm font-medium text-ink-900">{label}</div>
        <div className="text-xs text-ink-500">{purpose}</div>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={current ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm text-ink-900 focus:border-primary-500 focus:outline-none disabled:opacity-50 dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
        >
          <option value="">{t("(ডিফল্ট ব্যবহার করুন)", "(use default)")}</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {current && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            title={t("ক্লিয়ার", "Clear")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  onEdit,
  onTest,
  onDelete,
  deleting,
}: {
  provider: SmtpProvider;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="rounded-lg border border-ink-200 p-4 dark:border-ink-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">
              {provider.label}
            </h3>
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
              <span className="text-ink-500">{t("সার্ভার:", "Server:")}</span>{" "}
              <code className="font-mono text-ink-900">
                {provider.host}:{provider.port}
              </code>
            </div>
            <div>
              <span className="text-ink-500">{t("ইউজার:", "User:")}</span>{" "}
              <code className="font-mono text-ink-900">{provider.user}</code>
            </div>
            <div>
              <span className="text-ink-500">{t("পাসওয়ার্ড:", "Password:")}</span>{" "}
              <code className="font-mono text-ink-900">••••••••</code>
            </div>
            <div>
              <span className="text-ink-500">{t("এনক্রিপশন:", "Encryption:")}</span>{" "}
              <span className="text-ink-900">{provider.encryption}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-ink-500">{t("প্রেরক:", "From:")}</span>{" "}
              <span className="text-ink-900">
                {provider.fromName} &lt;{provider.fromAddress}&gt;
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={deleting}
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
  existing: SmtpProvider | null;
  onSaved: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [form, setForm] = useState({ ...emptyProvider });
  const [replacePassword, setReplacePassword] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        label: existing.label,
        host: existing.host,
        port: existing.port,
        user: existing.user,
        pass: "",
        fromAddress: existing.fromAddress,
        fromName: existing.fromName,
        encryption: existing.encryption,
        rejectUnauthorized: existing.rejectUnauthorized,
        isActive: existing.isActive,
      });
      setReplacePassword(false);
    } else {
      setForm({ ...emptyProvider });
      setReplacePassword(false);
    }
  }, [existing, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        const body: any = {
          label: form.label,
          host: form.host,
          port: form.port,
          user: form.user,
          fromAddress: form.fromAddress,
          fromName: form.fromName,
          encryption: form.encryption,
          rejectUnauthorized: form.rejectUnauthorized,
          isActive: form.isActive,
        };
        if (replacePassword) body.pass = form.pass;
        return api.patch(`/admin/system/smtp/providers/${existing.id}`, body);
      }
      return api.post("/admin/system/smtp/providers", form);
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      onSaved();
    },
    onError: (e) => toast.error(extractApiMessage(e, "Save failed")),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? t("প্রদানকারী এডিট", "Edit provider") : t("নতুন প্রদানকারী", "New provider")}
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
              maxLength={80}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Brevo transactional"
            />
          </Field>
          <Field label={t("হোস্ট", "Host")} required>
            <Input
              required
              maxLength={255}
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="smtp-relay.brevo.com"
            />
          </Field>
          <Field label={t("পোর্ট", "Port")} required>
            <Input
              required
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) =>
                setForm({ ...form, port: parseInt(e.target.value || "0", 10) })
              }
            />
          </Field>
          <Field label={t("ইউজার", "Username")} required>
            <Input
              required
              maxLength={255}
              value={form.user}
              onChange={(e) => setForm({ ...form, user: e.target.value })}
              placeholder="apikey or user@domain"
            />
          </Field>
          <Field
            label={t("পাসওয়ার্ড", "Password")}
            required={!existing}
          >
            {existing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={form.pass}
                  disabled={!replacePassword}
                  onChange={(e) => setForm({ ...form, pass: e.target.value })}
                  placeholder={replacePassword ? "" : "••••••••"}
                />
                <label className="flex items-center gap-1 text-xs text-ink-600">
                  <input
                    type="checkbox"
                    checked={replacePassword}
                    onChange={(e) => {
                      setReplacePassword(e.target.checked);
                      if (!e.target.checked) setForm({ ...form, pass: "" });
                    }}
                  />
                  {t("পরিবর্তন", "Replace")}
                </label>
              </div>
            ) : (
              <Input
                required
                type="password"
                value={form.pass}
                onChange={(e) => setForm({ ...form, pass: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("এনক্রিপশন", "Encryption")} required>
            <select
              value={form.encryption}
              onChange={(e) =>
                setForm({ ...form, encryption: e.target.value as SmtpEncryption })
              }
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none dark:border-ink-300 dark:bg-ink-50"
            >
              {ENCRYPTIONS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </Field>
          <Field label={t("প্রেরক ঠিকানা", "From address")} required>
            <Input
              required
              type="email"
              maxLength={255}
              value={form.fromAddress}
              onChange={(e) => setForm({ ...form, fromAddress: e.target.value })}
              placeholder="orders@xovenmart.com"
            />
          </Field>
          <Field label={t("প্রেরক নাম", "From name")} required>
            <Input
              required
              maxLength={120}
              value={form.fromName}
              onChange={(e) => setForm({ ...form, fromName: e.target.value })}
              placeholder="XovenMart"
            />
          </Field>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-ink-700">
            <input
              type="checkbox"
              checked={form.rejectUnauthorized}
              onChange={(e) =>
                setForm({ ...form, rejectUnauthorized: e.target.checked })
              }
            />
            {t("সার্ট ভেরিফাই করুন", "Verify TLS certificate")}
          </label>
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
}: {
  provider: SmtpProvider | null;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [to, setTo] = useState("");

  useEffect(() => {
    setTo("");
  }, [provider]);

  const send = useMutation({
    mutationFn: async () => {
      if (!provider) return;
      return api.post(`/admin/system/smtp/providers/${provider.id}/test`, { to });
    },
    onSuccess: (res: any) => {
      toast.success(
        t(
          `পাঠানো হয়েছে (${res?.messageId ?? ""})`,
          `Sent (${res?.messageId ?? ""})`,
        ),
      );
      onClose();
    },
    onError: (e: any) => {
      // Backend returns structured `{ message, errorCode, provider }` for SMTP errors.
      // Show the code as a small caption so the admin knows what to fix.
      const code = e?.data?.errorCode as string | undefined;
      const msg = extractApiMessage(e, "Test failed");
      const desc = code ? `${msg} (${code})` : msg;
      toast.error(desc, {
        description: code
          ? codeLabel(code, lang)
          : undefined,
        duration: 8000,
      });
    },
  });

  return (
    <Modal
      open={provider !== null}
      onClose={onClose}
      title={t("টেস্ট ইমেইল পাঠান", "Send test email")}
    >
      {provider && (
        <div className="space-y-4">
          <div className="rounded-md border border-ink-200 bg-ink-50 p-3 text-sm dark:border-ink-300 dark:bg-ink-100">
            <div className="font-medium text-ink-900">{provider.label}</div>
            <div className="text-ink-600">
              <code className="font-mono">{provider.host}:{provider.port}</code>{" "}
              · {provider.encryption} ·{" "}
              {t("প্রেরক:", "From:")} {provider.fromAddress}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-700">
              {t("প্রাপক", "Recipient")}
            </span>
            <Input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="admin@xovenmart.com"
            />
          </label>
          <div className="flex items-center gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {t(
                "পাঠানোর পর প্রাপকের ইনবক্স চেক করুন (স্প্যাম ফোল্ডার সহ)।",
                "After sending, check the recipient's inbox (including spam folder).",
              )}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("বাতিল", "Cancel")}
            </Button>
            <Button
              onClick={() => send.mutate()}
              disabled={!to || send.isPending}
            >
              {send.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MailQuestion className="mr-2 h-4 w-4" />
              )}
              {t("পাঠান", "Send")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
