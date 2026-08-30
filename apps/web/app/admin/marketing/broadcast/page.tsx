"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Mail, MessageSquare, Bell, Users, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface BroadcastLog {
  id: string;
  channel: string;
  recipient: string;
  subject?: string | null;
  body: string;
  status: string;
  audience?: string | null;
  sentAt: string;
}

export default function BroadcastPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    channel: "email",
    audience: "customers",
    subject: "",
    body: "",
  });

  const { data: logs } = useQuery({
    queryKey: ["admin", "marketing", "broadcast", "history"],
    queryFn: () => api.get("/admin/notifications?perPage=20"),
  });

  const items: BroadcastLog[] = (((logs as any)?.items ?? []) as any[]).filter((n) => n.audience?.startsWith("marketing."));

  const send = useMutation({
    mutationFn: () => api.post("/admin/marketing/broadcast", form),
    onSuccess: (res: any) => {
      toast.success(t(`${res.count ?? 0} জনকে পাঠানো হয়েছে (লগ)`, `Sent to ${res.count ?? 0} recipients (logged)`));
      qc.invalidateQueries({ queryKey: ["admin", "marketing"] });
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      setForm((s) => ({ ...s, subject: "", body: "" }));
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Send failed"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("ব্রডকাস্ট", "Broadcast")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("কাস্টমার ও অ্যাডমিনদের কাছে বার্তা পাঠান", "Send messages to customers and admins")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" /> {t("নতুন ব্রডকাস্ট", "New Broadcast")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("চ্যানেল", "Channel")}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "email", Icon: Mail, bn: "ইমেইল", en: "Email" },
                  { v: "sms", Icon: MessageSquare, bn: "SMS", en: "SMS" },
                  { v: "push", Icon: Bell, bn: "পুশ", en: "Push" },
                ].map((c) => {
                  const Icon = c.Icon;
                  const active = form.channel === c.v;
                  return (
                    <button
                      key={c.v}
                      onClick={() => setForm((s) => ({ ...s, channel: c.v }))}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${active ? "border-primary-700 bg-primary-50 text-primary-700" : "border-ink-200 text-ink-700 dark:border-ink-300 dark:text-ink-700"}`}
                    >
                      <Icon className="h-4 w-4" /> {t(c.bn, c.en)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শ্রোতা", "Audience")}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "customers", Icon: Users, bn: "কাস্টমার", en: "Customers" },
                  { v: "admins", Icon: Shield, bn: "অ্যাডমিন", en: "Admins" },
                  { v: "all", Icon: Megaphone, bn: "সবাই", en: "Everyone" },
                ].map((a) => {
                  const Icon = a.Icon;
                  const active = form.audience === a.v;
                  return (
                    <button
                      key={a.v}
                      onClick={() => setForm((s) => ({ ...s, audience: a.v }))}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${active ? "border-primary-700 bg-primary-50 text-primary-700" : "border-ink-200 text-ink-700 dark:border-ink-300 dark:text-ink-700"}`}
                    >
                      <Icon className="h-4 w-4" /> {t(a.bn, a.en)}
                    </button>
                  );
                })}
              </div>
            </div>
            {form.channel === "email" && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">{t("বিষয়", "Subject")}</label>
                <Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("বার্তা", "Message")}</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
                rows={5}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-ink-200 pt-3 dark:border-ink-300">
            <p className="text-xs text-ink-500">{t("দ্রষ্টব্য: ডে-১ এ শুধু লগ হবে, প্রকৃত প্রেরণ পরে যুক্ত হবে।", "Note: Day-1 only logs. Actual sending wired later.")}</p>
            <Button onClick={() => send.mutate()} disabled={send.isPending || !form.body}>
              <Send className="h-4 w-4" /> {send.isPending ? t("পাঠাচ্ছে...", "Sending...") : t("লগ করুন", "Log")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("সাম্প্রতিক ইতিহাস", "Recent history")} ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন ইতিহাস নেই", "No history yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("সময়", "When")}</th>
                    <th className="px-2 py-2">{t("চ্যানেল", "Channel")}</th>
                    <th className="px-2 py-2">{t("প্রাপক", "Recipient")}</th>
                    <th className="px-2 py-2">{t("বিষয়", "Subject")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((n) => (
                    <tr key={n.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(n.sentAt).toLocaleString()}</td>
                      <td className="px-2 py-2"><Badge variant="muted">{n.channel.toUpperCase()}</Badge></td>
                      <td className="px-2 py-2 font-mono text-xs">{n.recipient}</td>
                      <td className="px-2 py-2 text-xs">{n.subject ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}