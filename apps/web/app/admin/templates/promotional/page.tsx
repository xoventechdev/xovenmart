"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone,
  Plus,
  Trash2,
  Pencil,
  X,
  AlertCircle,
} from "lucide-react";
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
 *   - `email.order_*` → Order Updates page
 *   - `sms.otp` / `email.otp` → SMS/Email page (filtered by category)
 *   - everything else (welcome, deal_alert, abandoned_cart, winback, …) → here.
 */
interface Template {
  key: string;
  channel: string;
  name: string;
  category: string;
  description?: string;
  emailPurpose?: string | null;
  subjectEn?: string;
  bodyEn: string;
  bodyBn?: string;
  variables: { name: string; required?: boolean }[];
  staged?: boolean;
  updatedAt: string;
}

const OPERATIONAL_PREFIXES = ["order_", "otp_"];

export default function PromotionalTemplatesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();
  const router = useRouter();
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
          <Plus className="h-4 w-4" />
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
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : templates && templates.length > 0 ? (
            templates.map((tpl) => (
              <Link
                key={tpl.key}
                href={`/admin/templates/${tpl.channel}/${tpl.name}`}
                className="flex items-center gap-3 rounded-md border border-ink-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{tpl.name}</span>
                    <Badge variant="muted">{tpl.channel.toUpperCase()}</Badge>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                      {tpl.category}
                    </Badge>
                    {tpl.staged && (
                      <Badge variant="muted" className="bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
                        {t("স্টেজড", "STAGED")}
                      </Badge>
                    )}
                    <span className="font-mono text-[10px] text-ink-500">{tpl.key}</span>
                  </div>
                  {tpl.description && (
                    <div className="mt-0.5 truncate text-xs text-ink-600 dark:text-ink-300">
                      {tpl.description}
                    </div>
                  )}
                  <div className="mt-0.5 truncate text-xs text-ink-500">
                    {tpl.subjectEn ?? tpl.bodyEn.slice(0, 80)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/admin/templates/${tpl.channel}/${tpl.name}`);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm(t(`${tpl.name} মুছে ফেলবেন?`, `Delete ${tpl.name}?`))) {
                        remove.mutate(tpl);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-danger-700" />
                  </Button>
                </div>
              </Link>
            ))
          ) : (
            <div className="py-12 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-ink-400" />
              <p className="text-sm text-ink-500">
                {t(
                  "কোন প্রমোশনাল টেমপ্লেট নেই — '+ নতুন যোগ করুন' দিয়ে শুরু করুন",
                  "No promotional templates yet — start by clicking '+ Add new'",
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && (
        <CreatePromoModal
          onClose={() => setCreating(false)}
          onCreated={(channel, name) => {
            setCreating(false);
            router.push(`/admin/templates/${channel}/${name}`);
          }}
        />
      )}
    </div>
  );
}

function CreatePromoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (channel: "email" | "sms" | "push", name: string) => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [channel, setChannel] = useState<"email" | "sms" | "push">("email");
  const [name, setName] = useState("welcome");
  const [subjectEn, setSubjectEn] = useState("");
  const [bodyEn, setBodyEn] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.put(`/admin/templates/${channel}/${name}`, {
        category: "marketing",
        variables: [],
        subjectEn: channel === "email" ? subjectEn : undefined,
        bodyEn,
      }),
    onSuccess: () => {
      toast.success(t("তৈরি হয়েছে", "Created"));
      qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      onCreated(channel, name);
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Create failed"),
  });

  const valid = /^[a-z][a-z0-9_]*$/.test(name) && bodyEn.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50"
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
              onChange={(e) => setName(e.target.value.toLowerCase())}
              className="mt-1.5 font-mono"
              placeholder="welcome / deal_alert / winback"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t(
                "ইউনিক কী। 'order_' বা 'otp_' দিয়ে শুরু করবেন না — এগুলো অপারেশনাল।",
                "Unique key. Don't start with 'order_' or 'otp_' — those are operational.",
              )}
            </p>
          </div>
          {channel === "email" && (
            <div>
              <label className="text-sm font-medium">{t("বিষয় (EN)", "Subject (EN)")}</label>
              <Input
                value={subjectEn}
                onChange={(e) => setSubjectEn(e.target.value)}
                className="mt-1.5"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">{t("বডি (EN)", "Body (EN)")}</label>
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={8}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !valid}>
            {create.isPending ? t("তৈরি হচ্ছে...", "Creating...") : t("তৈরি করুন", "Create")}
          </Button>
        </div>
      </div>
    </div>
  );
}
