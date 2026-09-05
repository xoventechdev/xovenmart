"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Bell,
  Save,
  Eye,
  Send,
  AlertTriangle,
  CheckCircle2,
  X,
  Globe,
  FileText,
  Code,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Channel = "email" | "sms" | "push";
type Locale = "bn" | "en";
type ContentTab = "text" | "html";

interface VariableSpec {
  name: string;
  type?: string;
  required?: boolean;
  sample?: string;
  label?: string;
}

interface TemplateRow {
  key: string;
  channel: Channel;
  name: string;
  category: string;
  description?: string;
  emailPurpose?: string | null;
  variables: VariableSpec[];
  subjectEn?: string;
  subjectBn?: string;
  bodyEn: string;
  bodyBn?: string;
  htmlBodyEn?: string;
  htmlBodyBn?: string;
  staged?: boolean;
  updatedAt?: string;
  updatedBy?: string | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  actorId: string;
  actorRole: string;
  createdAt: string;
  diff?: any;
}

const CHANNEL_ICON: Record<Channel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  push: Bell,
};

const CATEGORY_COLORS: Record<string, string> = {
  orders: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  auth: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  referral: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100",
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  backup: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  marketing: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
};

export default function TemplateEditorPage() {
  const params = useParams<{ channel: string; name: string }>();
  const router = useRouter();
  const channel = params.channel as Channel;
  const name = params.name as string;
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [locale, setLocale] = useState<Locale>("en");
  const [contentTab, setContentTab] = useState<ContentTab>("text");
  const [subjectEn, setSubjectEn] = useState("");
  const [subjectBn, setSubjectBn] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyBn, setBodyBn] = useState("");
  const [htmlBodyEn, setHtmlBodyEn] = useState("");
  const [htmlBodyBn, setHtmlBodyBn] = useState("");
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [previewBody, setPreviewBody] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewDirty, setPreviewDirty] = useState(false);
  const [showSendTest, setShowSendTest] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testLocale, setTestLocale] = useState<Locale>("en");
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const lastSavedSnapshot = useRef<string>("");

  const templateQuery = useQuery({
    queryKey: ["admin", "template", channel, name],
    queryFn: async () => {
      return (await api.get(`/admin/templates/${channel}/${name}`)) as TemplateRow;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["admin", "template", channel, name, "history"],
    queryFn: async () => {
      return (await api.get(
        `/admin/templates/${channel}/${name}/history`,
      )) as HistoryEntry[];
    },
  });

  // Hydrate editor from server response.
  useEffect(() => {
    if (!templateQuery.data) return;
    setSubjectEn(templateQuery.data.subjectEn ?? "");
    setSubjectBn(templateQuery.data.subjectBn ?? "");
    setBodyEn(templateQuery.data.bodyEn ?? "");
    setBodyBn(templateQuery.data.bodyBn ?? "");
    setHtmlBodyEn(templateQuery.data.htmlBodyEn ?? "");
    setHtmlBodyBn(templateQuery.data.htmlBodyBn ?? "");
    const seed: Record<string, string> = {};
    for (const v of templateQuery.data.variables ?? []) {
      seed[v.name] = v.sample ?? "";
    }
    setVarValues(seed);
    lastSavedSnapshot.current = JSON.stringify({
      subjectEn: templateQuery.data.subjectEn ?? "",
      subjectBn: templateQuery.data.subjectBn ?? "",
      bodyEn: templateQuery.data.bodyEn ?? "",
      bodyBn: templateQuery.data.bodyBn ?? "",
      htmlBodyEn: templateQuery.data.htmlBodyEn ?? "",
      htmlBodyBn: templateQuery.data.htmlBodyBn ?? "",
    });
    setPreviewDirty(false);
  }, [templateQuery.data]);

  // Dirty-state guard
  const dirty = useMemo(() => {
    const cur = JSON.stringify({ subjectEn, subjectBn, bodyEn, bodyBn, htmlBodyEn, htmlBodyBn });
    return cur !== lastSavedSnapshot.current;
  }, [subjectEn, subjectBn, bodyEn, bodyBn, htmlBodyEn, htmlBodyBn]);

  const ChannelIcon = CHANNEL_ICON[channel] ?? Mail;

  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/templates/${channel}/${name}`, {
        subjectEn,
        subjectBn,
        bodyEn,
        bodyBn,
        htmlBodyEn: htmlBodyEn || null,
        htmlBodyBn: htmlBodyBn || null,
        variables: templateQuery.data?.variables ?? [],
      }),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      lastSavedSnapshot.current = JSON.stringify({
        subjectEn,
        subjectBn,
        bodyEn,
        bodyBn,
        htmlBodyEn,
        htmlBodyBn,
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1500);
      qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      qc.invalidateQueries({ queryKey: ["admin", "template", channel, name] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  // Debounced live preview
  const previewMutation = useMutation({
    mutationFn: async () => {
      return (await api.post(`/admin/templates/${channel}/${name}/preview`, {
        locale,
        variables: varValues,
        override: {
          subjectEn,
          subjectBn,
          bodyEn,
          bodyBn,
          htmlBodyEn,
          htmlBodyBn,
        },
      })) as { rendered: string; renderedSubject?: string; renderedHtml?: string };
    },
    onSuccess: (data) => {
      setPreviewBody(data.rendered ?? "");
      setPreviewSubject(data.renderedSubject ?? "");
      setPreviewHtml(data.renderedHtml ?? "");
      setPreviewDirty(false);
    },
  });

  useEffect(() => {
    if (!templateQuery.data) return;
    setPreviewDirty(true);
    const handle = setTimeout(() => {
      previewMutation.mutate();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectEn, subjectBn, bodyEn, bodyBn, htmlBodyEn, htmlBodyBn, locale, JSON.stringify(varValues)]);

  const sendTest = useMutation({
    mutationFn: () =>
      api.post(`/admin/templates/test-send`, {
        channel,
        name,
        to: testTo,
        locale: testLocale,
        variables: varValues,
      }) as Promise<{ ok: boolean; providerUsed?: string; message?: string }>,
    onSuccess: (res) => {
      if (res.ok) {
        setTestResult({ ok: true, message: t(`পাঠানো হয়েছে (${res.providerUsed ?? "ok"})`, `Sent (${res.providerUsed ?? "ok"})`) });
        toast.success(t("পাঠানো হয়েছে", "Sent"));
      } else {
        setTestResult({ ok: false, message: res.message ?? "Failed" });
        toast.error(res.message ?? "Failed");
      }
    },
    onError: (e: any) => {
      setTestResult({ ok: false, message: e?.data?.message ?? "Failed" });
      toast.error(e?.data?.message ?? "Send failed");
    },
  });

  if (templateQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        <div className="h-64 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  if (templateQuery.isError || !templateQuery.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push(`/admin/templates/${channel}`)}>
          <ArrowLeft className="h-4 w-4" />
          {t("ফিরে যান", "Back")}
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-danger-500" />
            <p className="text-sm text-ink-700 dark:text-ink-900">
              {t("টেমপ্লেট পাওয়া যায়নি", "Template not found")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tpl = templateQuery.data;
  const lastHistory = historyQuery.data?.[0];

  function insertVar(field: "subjectEn" | "subjectBn" | "bodyEn" | "bodyBn" | "htmlBodyEn" | "htmlBodyBn", name: string) {
    const insert = `{{${name}}}`;
    if (field === "subjectEn") setSubjectEn((s) => s + insert);
    else if (field === "subjectBn") setSubjectBn((s) => s + insert);
    else if (field === "bodyEn") setBodyEn((s) => s + insert);
    else if (field === "bodyBn") setBodyBn((s) => s + insert);
    else if (field === "htmlBodyEn") setHtmlBodyEn((s) => s + insert);
    else if (field === "htmlBodyBn") setHtmlBodyBn((s) => s + insert);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg bg-gradient-to-r from-slate-900 to-indigo-700 p-5 text-white shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => router.push(`/admin/templates/${channel}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
              <ChannelIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{tpl.name}</h1>
                <Badge className={CATEGORY_COLORS[tpl.category] ?? "bg-ink-100"}>
                  {tpl.category}
                </Badge>
                {tpl.staged && (
                  <Badge variant="muted" className="bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
                    {t("স্টেজড", "STAGED")}
                  </Badge>
                )}
                {tpl.emailPurpose && (
                  <Badge variant="muted" className="bg-white/20 text-white">
                    {tpl.emailPurpose}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-white/80">{tpl.description ?? tpl.key}</p>
              <p className="mt-0.5 font-mono text-xs text-white/60">{tpl.key}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-white/80">
            {lastHistory && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {t("শেষ সম্পাদনা", "Last edited")}: {new Date(lastHistory.createdAt).toLocaleString()}
                </span>
              </div>
            )}
            {lastHistory && (
              <div className="flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                <span>
                  {t("দ্বারা", "by")} {lastHistory.actorRole} · {lastHistory.actorId.slice(0, 8)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Locale + content type tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-ink-200 dark:border-ink-300">
          <Button
            variant={locale === "en" ? "default" : "ghost"}
            size="sm"
            onClick={() => setLocale("en")}
          >
            <Globe className="h-3 w-3" />
            English
          </Button>
          <Button
            variant={locale === "bn" ? "default" : "ghost"}
            size="sm"
            onClick={() => setLocale("bn")}
          >
            বাংলা
          </Button>
        </div>
        {channel === "email" && (
          <div className="flex rounded-md border border-ink-200 dark:border-ink-300">
            <Button
              variant={contentTab === "text" ? "default" : "ghost"}
              size="sm"
              onClick={() => setContentTab("text")}
            >
              <FileText className="h-3 w-3" />
              {t("প্লেইন টেক্সট", "Plain Text")}
            </Button>
            <Button
              variant={contentTab === "html" ? "default" : "ghost"}
              size="sm"
              onClick={() => setContentTab("html")}
            >
              <Code className="h-3 w-3" />
              HTML
            </Button>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowSendTest(true)}
            disabled={!testTo && !showSendTest}
          >
            <Send className="h-4 w-4" />
            {t("টেস্ট পাঠান", "Send test")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
            {savedOk ? (
              <CheckCircle2 className="h-4 w-4 text-success-500" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {save.isPending
              ? t("সংরক্ষণ...", "Saving...")
              : savedOk
              ? t("সংরক্ষিত!", "Saved!")
              : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Editor */}
        <Card>
          <CardContent className="space-y-4 p-4">
            {channel === "email" && contentTab === "text" && (
              <>
                <Field
                  label={t("বিষয় (EN)", "Subject (EN)")}
                  value={subjectEn}
                  onChange={setSubjectEn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("subjectEn", n)}
                  placeholder="Order {{orderNo}} confirmed"
                />
                <Field
                  label={t("বিষয় (BN)", "Subject (BN)")}
                  value={subjectBn}
                  onChange={setSubjectBn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("subjectBn", n)}
                  placeholder="অর্ডার {{orderNo}} নিশ্চিত হয়েছে"
                />
                <TextAreaField
                  label={t("বডি (EN)", "Body (EN)")}
                  value={bodyEn}
                  onChange={setBodyEn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("bodyEn", n)}
                  rows={14}
                />
                <TextAreaField
                  label={t("বডি (BN)", "Body (BN)")}
                  value={bodyBn}
                  onChange={setBodyBn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("bodyBn", n)}
                  rows={14}
                />
              </>
            )}
            {channel === "email" && contentTab === "html" && (
              <>
                <TextAreaField
                  label="htmlBodyEn"
                  value={htmlBodyEn}
                  onChange={setHtmlBodyEn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("htmlBodyEn", n)}
                  rows={14}
                  mono
                />
                <TextAreaField
                  label="htmlBodyBn"
                  value={htmlBodyBn}
                  onChange={setHtmlBodyBn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("htmlBodyBn", n)}
                  rows={14}
                  mono
                />
              </>
            )}
            {channel !== "email" && (
              <>
                <TextAreaField
                  label={`bodyEn (${channel})`}
                  value={bodyEn}
                  onChange={setBodyEn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("bodyEn", n)}
                  rows={6}
                  mono={false}
                />
                <TextAreaField
                  label={`bodyBn (${channel})`}
                  value={bodyBn}
                  onChange={setBodyBn}
                  variables={tpl.variables}
                  onInsertVar={(n) => insertVar("bodyBn", n)}
                  rows={6}
                  mono={false}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Preview + variables */}
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    {t("লাইভ প্রিভিউ", "Live preview")} ({locale === "en" ? "English" : "বাংলা"})
                  </span>
                </div>
                {previewDirty && (
                  <Badge variant="muted" className="text-[10px]">
                    {t("আপডেট হচ্ছে...", "Updating...")}
                  </Badge>
                )}
              </div>
              {previewSubject && (
                <div className="rounded-md bg-ink-50 px-3 py-2 text-sm font-semibold dark:bg-ink-100">
                  {previewSubject}
                </div>
              )}
              {channel === "email" && contentTab === "html" && previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  sandbox=""
                  className="h-64 w-full rounded-md border border-ink-200 dark:border-ink-300"
                  title="preview"
                />
              ) : (
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 text-xs dark:bg-ink-100">
                  {previewBody || t("(টাইপ করুন — প্রিভিউ এখানে দেখাবে)", "(Type — preview appears here)")}
                </pre>
              )}
            </CardContent>
          </Card>

          {tpl.variables && tpl.variables.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  <span className="text-sm font-semibold">{t("ভেরিয়েবল", "Variables")}</span>
                </div>
                <p className="text-xs text-ink-500">
                  {t("প্রিভিউ এবং Send Test এর জন্য নমুনা মান", "Sample values for preview + Send Test")}
                </p>
                <div className="space-y-2">
                  {tpl.variables.map((v) => (
                    <div key={v.name} className="flex items-center gap-2">
                      <Badge variant="muted" className="min-w-[120px] justify-start font-mono text-[10px]">
                        {`{{${v.name}}}`}
                        {v.required && <span className="ml-1 text-danger-500">*</span>}
                      </Badge>
                      <Input
                        value={varValues[v.name] ?? ""}
                        onChange={(e) =>
                          setVarValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                        }
                        placeholder={v.sample ?? v.name}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {historyQuery.data && historyQuery.data.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-semibold">{t("ইতিহাস", "History")}</span>
                </div>
                <div className="space-y-1 text-xs text-ink-700 dark:text-ink-900">
                  {historyQuery.data.slice(0, 5).map((h) => (
                    <div key={h.id} className="flex justify-between border-b border-ink-100 pb-1 dark:border-ink-200">
                      <span>
                        <Badge variant="muted" className="mr-2 text-[10px]">
                          {h.action}
                        </Badge>
                        {h.actorRole} · {h.actorId.slice(0, 8)}
                      </span>
                      <span className="text-ink-500">{new Date(h.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Send-test modal */}
      {showSendTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSendTest(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-lg bg-white p-4 shadow-xl dark:bg-ink-50"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t("টেস্ট পাঠান", "Send test")}</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowSendTest(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium">
                {t("প্রাপক", "Recipient")}
                {channel === "email" ? " (email)" : " (phone)"}
              </label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder={channel === "email" ? "you@example.com" : "+8801712345678"}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("লোকেল", "Locale")}</label>
              <div className="mt-1 flex gap-2">
                <Button
                  variant={testLocale === "en" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTestLocale("en")}
                >
                  English
                </Button>
                <Button
                  variant={testLocale === "bn" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTestLocale("bn")}
                >
                  বাংলা
                </Button>
              </div>
            </div>
            {testResult && (
              <div
                className={`rounded-md p-2 text-xs ${
                  testResult.ok
                    ? "bg-success-100 text-success-900 dark:bg-success-900 dark:text-success-100"
                    : "bg-danger-100 text-danger-900 dark:bg-danger-900 dark:text-danger-100"
                }`}
              >
                {testResult.message}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSendTest(false)}>
                {t("বাতিল", "Cancel")}
              </Button>
              <Button
                onClick={() => sendTest.mutate()}
                disabled={!testTo || sendTest.isPending}
              >
                <Send className="h-4 w-4" />
                {sendTest.isPending ? t("পাঠানো হচ্ছে...", "Sending...") : t("পাঠান", "Send")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-changes guard */}
      {dirty && (
        <div className="fixed bottom-4 right-4 z-40 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 shadow dark:bg-amber-900 dark:text-amber-100">
          {t("আপনি অসংরক্ষিত পরিবর্তন আছে", "You have unsaved changes")}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  variables,
  onInsertVar,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  variables: VariableSpec[];
  onInsertVar: (name: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
        {variables.length > 0 && (
          <VariablePills variables={variables} onInsert={onInsertVar} />
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
        placeholder={placeholder}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  variables,
  onInsertVar,
  rows = 8,
  mono = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  variables: VariableSpec[];
  onInsertVar: (name: string) => void;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
        {variables.length > 0 && (
          <VariablePills variables={variables} onInsert={onInsertVar} />
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900 ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}

function VariablePills({
  variables,
  onInsert,
}: {
  variables: VariableSpec[];
  onInsert: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {variables.slice(0, 8).map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onInsert(v.name)}
          className="rounded-full bg-ink-100 px-2 py-0.5 font-mono text-[10px] hover:bg-primary-100 hover:text-primary-800 dark:bg-ink-200 dark:hover:bg-primary-900 dark:hover:text-primary-100"
          title={v.label ?? v.name}
        >
          {`{{${v.name}}}`}
        </button>
      ))}
    </div>
  );
}
