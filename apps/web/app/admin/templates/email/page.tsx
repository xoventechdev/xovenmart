"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Trash2, Pencil, X, Filter, AlertCircle } from "lucide-react";
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
 * Channel list page for EMAIL templates. The rows link into the bilingual
 * full-page editor at `/admin/templates/[channel]/[name]`. Categories are
 * surfaced as colored chips and a filter row lets the admin narrow down
 * (orders / auth / referral / admin / backup / marketing).
 */
interface Template {
  key: string;
  channel: string;
  name: string;
  category: string;
  description?: string;
  emailPurpose?: string | null;
  variables: { name: string; required?: boolean }[];
  subjectEn?: string;
  bodyEn: string;
  bodyBn?: string;
  staged?: boolean;
  updatedAt: string;
}

const CATEGORIES = ["orders", "auth", "referral", "admin", "backup", "marketing"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, { bn: string; en: string }> = {
  orders: { bn: "অর্ডার", en: "Orders" },
  auth: { bn: "অথ", en: "Auth" },
  referral: { bn: "রেফারেল", en: "Referral" },
  admin: { bn: "অ্যাডমিন", en: "Admin" },
  backup: { bn: "ব্যাকআপ", en: "Backup" },
  marketing: { bn: "মার্কেটিং", en: "Marketing" },
};

const CATEGORY_COLORS: Record<string, string> = {
  orders: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  auth: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  referral: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100",
  admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  backup: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  marketing: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
};

export default function EmailTemplatesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();
  const router = useRouter();
  const [cat, setCat] = useState<Category | "all">("all");
  const [creating, setCreating] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "templates", "email"],
    queryFn: async () => {
      const all = (await api.get("/admin/templates")) as Template[];
      return all.filter((x) => x.channel === "email");
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

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (cat === "all") return templates;
    return templates.filter((x) => x.category === cat);
  }, [templates, cat]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: templates?.length ?? 0 };
    for (const c of CATEGORIES) {
      m[c] = (templates ?? []).filter((x) => x.category === c).length;
    }
    return m;
  }, [templates]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("ইমেইল টেমপ্লেট", "Email Templates")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "গ্রাহকদের পাঠানো সব ইমেইল টেমপ্লেট — দ্বিভাষী, ক্যাটাগরি অনুযায়ী",
              "All email templates sent to customers — bilingual, grouped by category",
            )}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          {t("নতুন টেমপ্লেট", "New template")}
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-ink-500" />
        <button
          onClick={() => setCat("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            cat === "all"
              ? "bg-primary-700 text-white"
              : "bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-200 dark:text-ink-900 dark:hover:bg-ink-300"
          }`}
        >
          {t("সব", "All")} ({counts.all})
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            disabled={counts[c] === 0}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              cat === c
                ? "bg-primary-700 text-white"
                : CATEGORY_COLORS[c]
            } disabled:opacity-40`}
          >
            {t(CATEGORY_LABEL[c].bn, CATEGORY_LABEL[c].en)} ({counts[c]})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("সব ইমেইল টেমপ্লেট", "All Email Templates")}</CardTitle>
          <CardDescription>
            {t(
              "রো-তে ক্লিক করলে দ্বিভাষী এডিটর খুলবে — BN ⇄ EN সাইড-বাই-সাইড, লাইভ প্রিভিউ, Send Test",
              "Click a row to open the bilingual editor — BN ⇄ EN side-by-side, live preview, Send Test",
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
          ) : filtered.length > 0 ? (
            filtered.map((tpl) => (
              <Link
                key={tpl.key}
                href={`/admin/templates/${tpl.channel}/${tpl.name}`}
                className="flex items-center gap-3 rounded-md border border-ink-200 p-3 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-ink-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/20"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{tpl.name}</span>
                    <Badge className={CATEGORY_COLORS[tpl.category] ?? "bg-ink-100"}>
                      {tpl.category}
                    </Badge>
                    {tpl.staged && (
                      <Badge variant="muted" className="bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100">
                        {t("স্টেজড", "STAGED")}
                      </Badge>
                    )}
                    {tpl.emailPurpose && (
                      <Badge variant="muted">{tpl.emailPurpose}</Badge>
                    )}
                    <span className="font-mono text-[10px] text-ink-500">{tpl.key}</span>
                  </div>
                  {tpl.description && (
                    <div className="mt-0.5 truncate text-xs text-ink-600 dark:text-ink-300">
                      {tpl.description}
                    </div>
                  )}
                  <div className="mt-0.5 truncate text-xs text-ink-500">
                    {tpl.subjectEn ?? "(no subject)"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("এডিট", "Edit")}
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
                    title={t("মুছুন", "Delete")}
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
                {t("এই ক্যাটাগরিতে কোন টেমপ্লেট নেই", "No templates in this category")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && (
        <CreateTemplateModal
          defaultChannel="email"
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            router.push(`/admin/templates/email/${name}`);
          }}
        />
      )}
    </div>
  );
}

function CreateTemplateModal({
  defaultChannel,
  onClose,
  onCreated,
}: {
  defaultChannel: "email" | "sms" | "push";
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const [channel, setChannel] = useState<"email" | "sms" | "push">(defaultChannel);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("orders");
  const [description, setDescription] = useState("");
  const [subjectEn, setSubjectEn] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyBn, setBodyBn] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        category,
        description,
        variables: [],
        bodyEn,
        bodyBn: bodyBn || null,
      };
      if (channel === "email") {
        payload.subjectEn = subjectEn;
        payload.subjectBn = null;
      }
      return api.put(`/admin/templates/${channel}/${name}`, payload);
    },
    onSuccess: () => {
      toast.success(t("তৈরি হয়েছে", "Created"));
      qc.invalidateQueries({ queryKey: ["admin", "templates"] });
      onCreated(name);
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Create failed"),
  });

  const valid = /^[a-z][a-z0-9_]*$/.test(name) && name.length >= 3 && bodyEn.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">{t("নতুন টেমপ্লেট", "New template")}</h2>
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
              placeholder="order_custom_thing"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t(
                "ইউনিক কী। lowercase + underscore। যেমন: order_placed, otp, welcome",
                "Unique key. lowercase + underscore. E.g. order_placed, otp, welcome",
              )}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">{t("ক্যাটাগরি", "Category")}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_LABEL[c].bn, CATEGORY_LABEL[c].en)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">
              {t("বিবরণ", "Description")} ({t("ঐচ্ছিক", "optional")})
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
              placeholder={t("এই টেমপ্লেট কখন পাঠানো হয়", "When this template is sent")}
            />
          </div>
          {channel === "email" && (
            <div>
              <label className="text-sm font-medium">{t("বিষয় (EN)", "Subject (EN)")}</label>
              <Input
                value={subjectEn}
                onChange={(e) => setSubjectEn(e.target.value)}
                className="mt-1.5"
                placeholder="Order {{orderNo}} confirmed"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">{t("বডি (EN)", "Body (EN)")}</label>
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              rows={6}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
            <p className="mt-1 text-xs text-ink-500">
              {t("ভেরিয়েবল", "Variables")}: {"{{name}}"}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">
              {t("বডি (BN)", "Body (BN)")} ({t("ঐচ্ছিক", "optional")})
            </label>
            <textarea
              value={bodyBn}
              onChange={(e) => setBodyBn(e.target.value)}
              rows={6}
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
