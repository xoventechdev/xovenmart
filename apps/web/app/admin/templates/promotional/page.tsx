"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Save, Eye, Trash2, Pencil, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * "Promotional" templates — filtered view of templates whose names DON'T
 * start with `order_` or `otp_`. Same backend, different lens:
 *   - `email.order_placed` etc. → Order Updates page
 *   - `sms.otp` → SMS Templates page
 *   - everything else (welcome, deal_alert, abandoned_cart, winback, …) → here.
 */
interface Template {
  key: string;
  channel: string;
  name: string;
  subject?: string;
  body: string;
  variables?: string[];
  updatedAt: string;
}

const OPERATIONAL_PREFIXES = ["order_", "otp_"];

export default function PromotionalTemplatesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "templates", "promotional"],
    queryFn: async () => {
      const all = (await api.get("/admin/templates")) as Template[];
      return all.filter(
        (x) => !OPERATIONAL_PREFIXES.some((p) => x.name.startsWith(p)),
      );
    },
  });

  const remove = useMutation({
    mutationFn: (tpl: Template) =>
      api.delete(`/admin/templates/${tpl.channel}/${tpl.name}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "templates"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("প্রমোশনাল টেমপ্লেট", "Promotional Templates")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "মার্কেটিং ক্যাম্পেইন, ডিল অ্যালার্ট এবং অন্যান্য প্রমোশনাল বার্তা",
              "Marketing campaigns, deal alerts, and other promotional messages",
            )}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Megaphone className="h-4 w-4" />
          {t("নতুন যোগ করুন", "Add new")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("সব প্রমোশনাল টেমপ্লেট", "All Promotional Templates")}
          </CardTitle>
          <CardDescription>
            {t(
              "যেমন: welcome, deal_alert, abandoned_cart, winback, …",
              "E.g. welcome, deal_alert, abandoned_cart, winback, …",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : templates && templates.length > 0 ? (
            templates.map((tpl) => (
              <div
                key={tpl.key}
                className="rounded-md border border-ink-200 p-3 dark:border-ink-300"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-accent-100 text-accent-700 dark:bg-accent-900 dark:text-accent-100">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{tpl.name}</span>
                      <Badge variant="muted" className="text-[10px]">
                        {tpl.channel.toUpperCase()}
                      </Badge>
                      <Badge variant="muted" className="font-mono text-[10px]">
                        {tpl.key}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-500">
                      {tpl.subject ?? tpl.body.slice(0, 80)}
                    </div>
                    {(tpl.variables ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(tpl.variables ?? []).map((v) => (
                          <Badge key={v} variant="muted" className="text-[10px]">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(tpl)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(tpl);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-danger-700" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-ink-500">
              {t(
                "কোন প্রমোশনাল টেমপ্লেট নেই — '+ নতুন যোগ করুন' দিয়ে শুরু করুন",
                "No promotional templates yet — start by clicking '+ Add new'",
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {creating && (
        <CreateTemplateModal onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/templates/${template.channel}/${template.name}`, {
        subject,
        body,
        variables: template.variables ?? [],
      }),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  const sampleVars: Record<string, string> = {
    customerName: "Rahim Ahmed",
    code: "WELCOME10",
    dealName: "Weekend Fresh Deal",
    url: "https://xovenmart.com/deals/welcome",
  };

  const doPreview = useMutation({
    mutationFn: () =>
      api.post(`/admin/templates/${template.channel}/${template.name}/preview`, {
        variables: sampleVars,
      }) as Promise<{ rendered: string; renderedSubject?: string }>,
    onSuccess: (data) => {
      setPreview(data.rendered);
      setPreviewSubject(data.renderedSubject ?? null);
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Preview failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <div>
            <h2 className="font-semibold">{template.name}</h2>
            <p className="text-xs text-ink-500">
              {template.channel.toUpperCase()} · {template.key}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {template.channel === "email" && (
            <div>
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("বিষয়", "Subject")}
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1.5"
                placeholder="{{dealName}} is live now!"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("বডি", "Body")}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t("ভেরিয়েবলস", "Variables")}: {`{{name}}`} {t("ফরম্যাটে", "format")}.
              {(template.variables ?? []).length > 0 && (
                <span className="ml-2">
                  {(template.variables ?? []).map((v) => `{{${v}}}`).join("  ")}
                </span>
              )}
            </p>
          </div>

          {preview !== null && (
            <div className="rounded-md border border-ink-200 bg-ink-50 p-3 dark:border-ink-300 dark:bg-ink-100">
              <div className="mb-2 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span className="text-sm font-medium">{t("প্রিভিউ", "Preview")}</span>
              </div>
              {previewSubject && (
                <div className="mb-1 text-sm font-semibold">{previewSubject}</div>
              )}
              <pre className="whitespace-pre-wrap text-xs text-ink-700 dark:text-ink-900">
                {preview}
              </pre>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={() => doPreview.mutate()} disabled={doPreview.isPending}>
            <Eye className="h-4 w-4" />
            {t("প্রিভিউ", "Preview")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateTemplateModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [channel, setChannel] = useState<"email" | "sms" | "push">("email");
  const [name, setName] = useState("welcome");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.put(`/admin/templates/${channel}/${name}`, {
        subject: channel === "email" ? subject : undefined,
        body,
        variables: [],
      }),
    onSuccess: () => {
      toast.success(t("তৈরি হয়েছে", "Created"));
      qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Create failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">{t("নতুন প্রমোশনাল টেমপ্লেট", "New promotional template")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <label className="text-sm font-medium">{t("চ্যানেল", "Channel")}</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as any)}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("নাম", "Name")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              placeholder="welcome / deal_alert / winback / …"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t(
                "ইউনিক কী হতে হবে। 'order_' বা 'otp_' দিয়ে শুরু করবেন না — এগুলো অপারেশনাল।",
                "Must be a unique key. Don't start with 'order_' or 'otp_' — those are operational.",
              )}
            </p>
          </div>
          {channel === "email" && (
            <div>
              <label className="text-sm font-medium">{t("বিষয়", "Subject")}</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1.5"
                placeholder="{{dealName}} is live now!"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">{t("বডি", "Body")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !name || !body}
          >
            <Save className="h-4 w-4" />
            {create.isPending ? t("তৈরি হচ্ছে...", "Creating...") : t("তৈরি করুন", "Create")}
          </Button>
        </div>
      </div>
    </div>
  );
}