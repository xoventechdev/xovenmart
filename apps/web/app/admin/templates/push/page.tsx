"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Save, Eye, Trash2, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Template {
  key: string;
  channel: string;
  name: string;
  subject?: string;
  body: string;
  variables?: string[];
  updatedAt: string;
}

export default function PushTemplatesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "templates", "push"],
    queryFn: async () => {
      const all = (await api.get("/admin/templates")) as Template[];
      return all.filter((x) => x.channel === "push");
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
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("পুশ টেমপ্লেট", "Push Templates")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("পুশ নোটিফিকেশন টেমপ্লেট পরিচালনা করুন", "Manage push notification templates")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("সব পুশ টেমপ্লেট", "All Push Templates")}</CardTitle>
          <CardDescription>
            {t("অর্ডার স্ট্যাটাস, প্রমোশন এবং অন্যান্য পুশ", "Order status, promotions and other push notifications")}
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
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{tpl.name}</span>
                      <Badge variant="muted" className="font-mono text-[10px]">
                        {tpl.key}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-500">
                      {tpl.subject ? `${tpl.subject} — ` : ""}
                      {tpl.body}
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
              {t("কোন টেমপ্লেট নেই", "No templates")}
            </p>
          )}
        </CardContent>
      </Card>

      {editing && (
        <PushEditor
          template={editing}
          channel="push"
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PushEditor({
  template,
  channel,
  onClose,
}: {
  template: Template;
  channel: string;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [title, setTitle] = useState(template.subject ?? template.name);
  const [body, setBody] = useState(template.body);
  const [preview, setPreview] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/templates/${channel}/${template.name}`, {
        subject: title,
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
    orderNo: "XVM-260828-001",
    status: "Out for Delivery",
  };

  const doPreview = useMutation({
    mutationFn: () =>
      api.post(`/admin/templates/${channel}/${template.name}/preview`, {
        variables: sampleVars,
      }) as Promise<{ rendered: string }>,
    onSuccess: (data) => setPreview(data.rendered),
    onError: (e: any) => toast.error(e?.data?.message ?? "Preview failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <div>
            <h2 className="font-semibold">{template.name}</h2>
            <p className="text-xs text-ink-500">{template.key}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("শিরোনাম", "Title")}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("বার্তা", "Body")}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t("ভেরিয়েবলস", "Variables")}:{" "}
              {(template.variables ?? []).map((v) => `{{${v}}}`).join("  ") || "—"}
            </p>
          </div>

          <div className="rounded-md border border-ink-200 bg-ink-50 p-3 dark:border-ink-300 dark:bg-ink-100">
            <div className="mb-2 text-xs uppercase text-ink-500">
              {t("মোবাইল প্রিভিউ", "Mobile Preview")}
            </div>
            <div className="rounded-md bg-white p-3 shadow dark:bg-ink-50">
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-900">
                {title}
              </div>
              <div className="mt-1 text-xs text-ink-700 dark:text-ink-700">
                {preview ?? body}
              </div>
            </div>
          </div>
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