"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus, X, Save, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Ticket {
  id: string;
  ticketNo: string;
  customerPhone: string;
  customerName?: string | null;
  subject: string;
  message: string;
  status: string;
  priority: string;
  reply?: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function statusVariant(s: string): "default" | "warning" | "success" | "danger" | "info" {
  if (s === "OPEN") return "warning";
  if (s === "IN_PROGRESS") return "info";
  if (s === "WAITING_CUSTOMER") return "default";
  if (s === "RESOLVED") return "success";
  if (s === "CLOSED") return "default";
  return "default";
}

function priorityVariant(p: string): "default" | "warning" | "danger" {
  if (p === "URGENT") return "danger";
  if (p === "HIGH") return "warning";
  return "default";
}

export default function SupportTicketsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "support", "tickets", filterStatus, filterPriority],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterPriority) params.set("priority", filterPriority);
      return api.get(`/admin/support/tickets?${params.toString()}`);
    },
  });

  const items: Ticket[] = ((data as any)?.items ?? []) as any;

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/support/tickets/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success(t("টিকিট মুছে ফেলা হয়েছে", "Ticket deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("সাপোর্ট টিকিট", "Support Tickets")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("কাস্টমার সাপোর্ট টিকিট দেখুন ও পরিচালনা করুন", "View and manage customer support tickets")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন টিকিট", "New Ticket")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("স্ট্যাটাস", "Status")}</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("সব", "All")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("অগ্রাধিকার", "Priority")}</label>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("সব", "All")}</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4" /> {t("টিকিট", "Tickets")} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন টিকিট নেই", "No tickets")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("টিকিট নং", "Ticket #")}</th>
                    <th className="px-2 py-2">{t("কাস্টমার", "Customer")}</th>
                    <th className="px-2 py-2">{t("বিষয়", "Subject")}</th>
                    <th className="px-2 py-2">{t("স্ট্যাটাস", "Status")}</th>
                    <th className="px-2 py-2">{t("অগ্রাধিকার", "Priority")}</th>
                    <th className="px-2 py-2">{t("শেষ আপডেট", "Last update")}</th>
                    <th className="px-2 py-2">{t("অ্যাকশন", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t2) => (
                    <tr key={t2.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 font-mono text-xs">{t2.ticketNo}</td>
                      <td className="px-2 py-2">
                        <div className="text-sm">{t2.customerName ?? "—"}</div>
                        <div className="font-mono text-[10px] text-ink-500">{t2.customerPhone}</div>
                      </td>
                      <td className="px-2 py-2 text-sm">{t2.subject}</td>
                      <td className="px-2 py-2"><Badge variant={statusVariant(t2.status)}>{t2.status}</Badge></td>
                      <td className="px-2 py-2"><Badge variant={priorityVariant(t2.priority)}>{t2.priority}</Badge></td>
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(t2.updatedAt).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <TicketRowMenu ticket={t2} />
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(t2.id); }}>
                            <Trash2 className="h-3 w-3 text-danger-700" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <TicketDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function TicketRowMenu({ ticket }: { ticket: Ticket }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [open, setOpen] = useState(false);

  const update = useMutation({
    mutationFn: (body: any) => api.patch(`/admin/support/tickets/${encodeURIComponent(ticket.id)}`, body),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Update failed"),
  });

  const [reply, setReply] = useState(ticket.reply ?? "");
  const [status, setStatus] = useState(ticket.status);

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}><Pencil className="h-3 w-3" /></Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-ink-50">
            <h3 className="font-semibold">{t("টিকিট আপডেট", "Update ticket")} {ticket.ticketNo}</h3>
            <div className="mt-3 space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("স্ট্যাটাস", "Status")}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("উত্তর", "Reply")}</label>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900" />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>{t("বাতিল", "Cancel")}</Button>
              <Button onClick={() => update.mutate({ status, reply })} disabled={update.isPending}>
                <Save className="h-4 w-4" /> {t("সংরক্ষণ", "Save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TicketDialog({ onClose }: { onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    customerPhone: "",
    customerName: "",
    subject: "",
    message: "",
    priority: "NORMAL",
    status: "OPEN",
  });

  const create = useMutation({
    mutationFn: () => api.post("/admin/support/tickets", form),
    onSuccess: () => {
      toast.success(t("টিকিট তৈরি হয়েছে", "Ticket created"));
      qc.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Create failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{t("নতুন টিকিট", "New Ticket")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("কাস্টমার ফোন", "Customer Phone")}</label>
              <Input value={form.customerPhone} onChange={(e) => setForm((s) => ({ ...s, customerPhone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("কাস্টমার নাম", "Customer Name")}</label>
              <Input value={form.customerName} onChange={(e) => setForm((s) => ({ ...s, customerName: e.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("বিষয়", "Subject")}</label>
              <Input value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("অগ্রাধিকার", "Priority")}</label>
              <select value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("বার্তা", "Message")}</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
                rows={4}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.customerPhone || !form.subject || !form.message}>
            <Save className="h-4 w-4" /> {create.isPending ? t("তৈরি হচ্ছে...", "Creating...") : t("তৈরি করুন", "Create")}
          </Button>
        </div>
      </div>
    </div>
  );
}