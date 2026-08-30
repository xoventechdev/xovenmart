"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Send, Mail, MessageSquare, X, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface NotificationLog {
  id: string;
  channel: string;
  recipient: string;
  subject?: string | null;
  body: string;
  status: string;
  audience?: string | null;
  sentAt: string;
}

const CHANNELS = [
  { key: "all", bn: "সব", en: "All", icon: Bell },
  { key: "push", bn: "পুশ", en: "Push", icon: Bell },
  { key: "sms", bn: "SMS", en: "SMS", icon: MessageSquare },
  { key: "email", bn: "ইমেইল", en: "Email", icon: Mail },
];

function channelVariant(channel: string): "default" | "warning" | "success" | "info" {
  if (channel === "email") return "info";
  if (channel === "sms") return "warning";
  if (channel === "push") return "success";
  return "default";
}

function statusVariant(status: string): "default" | "warning" | "success" | "danger" {
  if (status === "VERIFIED" || status === "DELIVERED" || status === "SENT" || status === "BROADCAST") return "success";
  if (status === "FAILED" || status === "ERROR") return "danger";
  if (status === "LOGGED" || status === "QUEUED" || status === "PENDING") return "warning";
  return "default";
}

export default function NotificationsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [activeTab, setActiveTab] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [composing, setComposing] = useState(false);

  const tab = CHANNELS.find((c) => c.key === activeTab) ?? CHANNELS[0];
  const endpoint =
    activeTab === "all" ? "/admin/notifications" : `/admin/notifications/${activeTab}`;

  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin", "notifications", activeTab],
    queryFn: () => api.get(endpoint),
  });

  const items: NotificationLog[] = ((logs as any)?.items ?? []) as any;

  // Date filter (client-side)
  const filtered = items.filter((n) => {
    if (!fromDate && !toDate) return true;
    const d = new Date(n.sentAt).getTime();
    if (fromDate && d < new Date(fromDate).getTime()) return false;
    if (toDate && d > new Date(toDate).getTime() + 86400000) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("নোটিফিকেশন", "Notifications")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("সব নোটিফিকেশন লগ দেখুন � নতুন পাঠান", "View notification logs and send new notifications")}</p>
        </div>
        <Button onClick={() => setComposing(true)}>
          <Send className="h-4 w-4" /> {t("নতুন নোটিফিকেশন", "New Notification")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1 dark:border-ink-300 dark:bg-ink-50">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          const active = activeTab === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActiveTab(c.key)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-primary-700 text-white" : "text-ink-700 hover:bg-ink-100 dark:text-ink-700 dark:hover:bg-ink-200"}`}
            >
              <Icon className="h-4 w-4" /> {t(c.bn, c.en)}
            </button>
          );
        })}
      </div>

      {/* Date filter */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("থেকে", "From")}</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("পর্যন্ত", "To")}</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {(fromDate || toDate) && (
            <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>
              {t("মুছুন", "Clear")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <tab.icon className="h-4 w-4" /> {t(tab.bn, tab.en)} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন নোটিফিকেশন নেই", "No notifications yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("সময়", "When")}</th>
                    <th className="px-2 py-2">{t("চ্যানেল", "Channel")}</th>
                    <th className="px-2 py-2">{t("প্রাপক", "Recipient")}</th>
                    <th className="px-2 py-2">{t("বিষয়", "Subject")}</th>
                    <th className="px-2 py-2">{t("স্ট্যাটাস", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((n) => (
                    <tr key={n.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(n.sentAt).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <Badge variant={channelVariant(n.channel)}>{n.channel.toUpperCase()}</Badge>
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{n.recipient}</td>
                      <td className="px-2 py-2">{n.subject ?? <span className="text-ink-400">—</span>}</td>
                      <td className="px-2 py-2">
                        <Badge variant={statusVariant(n.status)}>{n.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {composing && <ComposeNotification onClose={() => setComposing(false)} />}
    </div>
  );
}

function ComposeNotification({ onClose }: { onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    channel: "email",
    recipient: "",
    subject: "",
    body: "",
  });

  const send = useMutation({
    mutationFn: () => api.post("/admin/notifications/send", form),
    onSuccess: () => {
      toast.success(t("পাঠানো হয়েছে (লগ হয়েছে)", "Sent (logged)"));
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Send failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{t("নতুন নোটিফিকেশন", "New Notification")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("চ্যানেল", "Channel")}</label>
            <select value={form.channel} onChange={(e) => setForm((s) => ({ ...s, channel: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("প্রাপক", "Recipient")}</label>
            <Input value={form.recipient} onChange={(e) => setForm((s) => ({ ...s, recipient: e.target.value }))} placeholder={form.channel === "email" ? "user@example.com" : "+8801XXXXXXXXX"} />
          </div>
          {form.channel === "email" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("বি�য়", "Subject")}</label>
              <Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("বার্তা", "Message")}</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
              rows={5}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </div>
          <p className="text-xs text-ink-500">{t("দ্রষ্টব্য: ডে-� তে নোটিফিকেশন শুধু লগ হবে, প্রকৃত প্রেরণ হবে না।", "Note: Day-1 only logs the notification — actual sending will be wired later.")}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || !form.recipient || !form.body}>
            <Save className="h-4 w-4" /> {send.isPending ? t("পাঠাচ্ছে...", "Sending...") : t("লগ করুন", "Log")}
          </Button>
        </div>
      </div>
    </div>
  );
}
