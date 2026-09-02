"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Info,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api, extractApiMessage } from "@/lib/api";

interface NoticeRow {
  id: string;
  textBn: string;
  textEn: string;
  linkUrl: string | null;
  linkLabelBn: string | null;
  linkLabelEn: string | null;
  severity: "info" | "warning" | "success" | "danger";
  position: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const SEVERITIES = [
  { key: "info", bn: "তথ্য", en: "Info", icon: Info, color: "bg-primary-100 text-primary-800" },
  { key: "warning", bn: "সতর্কতা", en: "Warning", icon: AlertTriangle, color: "bg-warning-100 text-warning-800" },
  { key: "success", bn: "সফল", en: "Success", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-800" },
  { key: "danger", bn: "বিপদ", en: "Danger", icon: AlertCircle, color: "bg-red-100 text-red-800" },
] as const;

const emptyDraft: Omit<NoticeRow, "id" | "createdAt" | "updatedAt"> = {
  textBn: "",
  textEn: "",
  linkUrl: "",
  linkLabelBn: "",
  linkLabelEn: "",
  severity: "info",
  position: "top",
  isActive: true,
  startsAt: null,
  endsAt: null,
  sortOrder: 0,
};

export default function NoticesAdminPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<typeof emptyDraft>(emptyDraft);
  const [showCompose, setShowCompose] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "marketing", "notices"],
    queryFn: () => api.get<NoticeRow[]>("/admin/marketing/notices"),
  });

  const create = useMutation({
    mutationFn: (body: typeof emptyDraft) => api.post<NoticeRow>("/admin/marketing/notices", body),
    onSuccess: () => {
      toast.success(t("তৈরি হয়েছে", "Created"));
      qc.invalidateQueries({ queryKey: ["admin", "marketing", "notices"] });
      setDraft(emptyDraft);
      setShowCompose(false);
    },
    onError: (e) => toast.error(extractApiMessage(e, t("ব্যর্থ", "Failed"))),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<typeof emptyDraft> }) =>
      api.patch<NoticeRow>(`/admin/marketing/notices/${id}`, body),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "marketing", "notices"] });
      setEditingId(null);
      setDraft(emptyDraft);
      setShowCompose(false);
    },
    onError: (e) => toast.error(extractApiMessage(e, t("ব্যর্থ", "Failed"))),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/marketing/notices/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "marketing", "notices"] });
    },
    onError: (e) => toast.error(extractApiMessage(e, t("ব্যর্থ", "Failed"))),
  });

  const toggleActive = (row: NoticeRow) => {
    update.mutate({ id: row.id, body: { isActive: !row.isActive } });
  };

  const startEdit = (row: NoticeRow) => {
    setEditingId(row.id);
    setShowCompose(true);
    setDraft({
      textBn: row.textBn,
      textEn: row.textEn,
      linkUrl: row.linkUrl ?? "",
      linkLabelBn: row.linkLabelBn ?? "",
      linkLabelEn: row.linkLabelEn ?? "",
      severity: row.severity,
      position: row.position,
      isActive: row.isActive,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      sortOrder: row.sortOrder,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowCompose(false);
  };

  const submit = () => {
    const body = {
      ...draft,
      linkUrl: draft.linkUrl || null,
      linkLabelBn: draft.linkLabelBn || null,
      linkLabelEn: draft.linkLabelEn || null,
    };
    if (editingId) update.mutate({ id: editingId, body });
    else create.mutate(body);
  };

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">
            {t("নোটিশ / মার্কি", "Notices / Marquee")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "ইউজার ওয়েবসাইট ও অ্যান্ড্রয়েডে মার্কি স্ট্রিপ হিসেবে দেখাবে।",
              "These show as a marquee strip on the user website and Android app.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <Loader2 className="h-4 w-4 mr-2" />
            {t("রিফ্রেশ", "Refresh")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              cancelEdit();
              setShowCompose(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("নতুন নোটিশ", "New notice")}
          </Button>
        </div>
      </div>

      {/* Composer */}
      {showCompose && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editingId ? t("নোটিশ সম্পাদনা", "Edit notice") : t("নতুন নোটিশ", "New notice")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("বাংলা টেক্সট", "Bengali text")} *
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-100 dark:text-ink-900"
                  value={draft.textBn}
                  onChange={(e) => setDraft({ ...draft, textBn: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("ইংরেজি টেক্সট", "English text")} *
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-100 dark:text-ink-900"
                  value={draft.textEn}
                  onChange={(e) => setDraft({ ...draft, textEn: e.target.value })}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("লিংক URL", "Link URL")}</label>
                <Input
                  value={draft.linkUrl ?? ""}
                  placeholder="https://…"
                  onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("লিংক লেবেল (BN)", "Link label (BN)")}</label>
                <Input
                  value={draft.linkLabelBn ?? ""}
                  onChange={(e) => setDraft({ ...draft, linkLabelBn: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("লিংক লেবেল (EN)", "Link label (EN)")}</label>
                <Input
                  value={draft.linkLabelEn ?? ""}
                  onChange={(e) => setDraft({ ...draft, linkLabelEn: e.target.value })}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("সিরিয়াসনেস", "Severity")}</label>
                <select
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-100 dark:text-ink-900"
                  value={draft.severity}
                  onChange={(e) => setDraft({ ...draft, severity: e.target.value as any })}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {lang === "en" ? s.en : s.bn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("অবস্থান", "Position")}</label>
                <Input
                  value={draft.position}
                  onChange={(e) => setDraft({ ...draft, position: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("শুরু", "Starts at")}</label>
                <Input
                  type="datetime-local"
                  value={draft.startsAt ? draft.startsAt.slice(0, 16) : ""}
                  onChange={(e) =>
                    setDraft({ ...draft, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("শেষ", "Ends at")}</label>
                <Input
                  type="datetime-local"
                  value={draft.endsAt ? draft.endsAt.slice(0, 16) : ""}
                  onChange={(e) =>
                    setDraft({ ...draft, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                  className="h-4 w-4"
                />
                {t("সক্রিয়", "Active")}
              </label>
              <div className="flex items-center gap-2">
                <label className="text-xs">{t("ক্রম", "Sort order")}</label>
                <Input
                  type="number"
                  className="w-20"
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-1" />
                {t("বাতিল", "Cancel")}
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={(!draft.textBn.trim() && !draft.textEn.trim()) || create.isPending || update.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                {editingId ? t("আপডেট", "Update") : t("তৈরি", "Create")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            {t("সব নোটিশ", "All notices")} ({items.length})
          </CardTitle>
          <CardDescription>
            {t("ড্র্যাফট ও শিডিউল করা সব নোটিশ দেখাচ্ছে।", "Showing drafts, scheduled, and active notices.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {t("কোনো নোটিশ নেই।", "No notices yet.")}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((row) => {
                const sev = SEVERITIES.find((s) => s.key === row.severity) ?? SEVERITIES[0];
                const SevIcon = sev.icon;
                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-ink-200 dark:border-ink-700 p-3 flex gap-3"
                  >
                    <div className={`p-2 rounded-full h-9 w-9 flex items-center justify-center shrink-0 ${sev.color}`}>
                      <SevIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.isActive ? (
                          <Badge variant="success">{t("সক্রিয়", "Active")}</Badge>
                        ) : (
                          <Badge variant="muted">{t("নিষ্ক্রিয়", "Inactive")}</Badge>
                        )}
                        <Badge variant="muted">{row.severity}</Badge>
                        <span className="text-xs text-muted-foreground">#{row.sortOrder}</span>
                        {row.startsAt && (
                          <span className="text-xs text-muted-foreground">
                            ↳ {new Date(row.startsAt).toLocaleString()}
                          </span>
                        )}
                        {row.endsAt && (
                          <span className="text-xs text-muted-foreground">
                            ↳ ⏎ {new Date(row.endsAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="font-medium mt-1">{row.textEn}</p>
                      {row.textBn && row.textBn !== row.textEn && (
                        <p className="text-sm text-muted-foreground">{row.textBn}</p>
                      )}
                      {row.linkUrl && (
                        <p className="text-xs text-primary mt-1 truncate">
                          → {row.linkLabelEn || row.linkUrl}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActive(row)}
                        disabled={update.isPending}
                      >
                        {row.isActive ? t("বন্ধ", "Disable") : t("চালু", "Enable")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(row)}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(row.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}