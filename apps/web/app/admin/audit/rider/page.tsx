"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Calendar, ChevronRight, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface AuditItem {
  id: string;
  actorId: string;
  actorRole: string;
  entity: string;
  entityId: string;
  action: string;
  diff: any;
  ip: string | null;
  createdAt: string;
  actorName?: string | null;
  actorEmail?: string | null;
}

interface AuditPage {
  items: AuditItem[];
  page: number;
  perPage: number;
  total: number;
}

export default function RiderActionsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [filters, setFilters] = useState({
    entity: "",
    action: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("perPage", "50");
  if (filters.entity) query.set("entity", filters.entity);
  if (filters.action) query.set("action", filters.action);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit", "rider-actions", page, filters],
    queryFn: () =>
      api.get(`/admin/audit/rider-actions?${query.toString()}`) as Promise<AuditPage>,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("রাইডার অ্যাকশন", "Rider Actions")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("শুধুমাত্র RIDER রোলের অ্যাকশন", "Actions performed by RIDER role only")}
          </p>
        </div>
        {data && (
          <Badge variant="info" className="text-xs">
            <User className="mr-1 h-3 w-3" /> {data.total} {t("অ্যাকশন", "actions")}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {t("ফিল্টার", "Filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder={t("এনটিটি (delivery, order...)", "Entity (delivery, order...)")}
              value={filters.entity}
              onChange={(e) => {
                setFilters((s) => ({ ...s, entity: e.target.value }));
                setPage(1);
              }}
            />
            <Input
              placeholder={t("অ্যাকশন", "Action")}
              value={filters.action}
              onChange={(e) => {
                setFilters((s) => ({ ...s, action: e.target.value }));
                setPage(1);
              }}
            />
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => {
                setFilters((s) => ({ ...s, from: e.target.value }));
                setPage(1);
              }}
            />
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => {
                setFilters((s) => ({ ...s, to: e.target.value }));
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <div className="space-y-1">
              {data.items.map((log) => (
                <Row
                  key={log.id}
                  log={log}
                  expanded={expandedId === log.id}
                  onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-ink-500">
                {t("কোন রাইডার অ্যাকশন পাওয়া যায়নি", "No rider actions found")}
              </p>
              <p className="mt-2 text-xs text-ink-400">
                {t(
                  "রাইডার ফ্লোতে অডিট লগ যোগ করা হলে এখানে দেখা যাবে",
                  "Rider flows need to be wired up to write audit logs first",
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-ink-500">
            {t("পৃষ্ঠা", "Page")} {data.page} / {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((s) => Math.max(1, s - 1))}
            >
              {t("আগের", "Previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((s) => s + 1)}
            >
              {t("পরের", "Next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  log,
  expanded,
  onToggle,
}: {
  log: AuditItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <div className="rounded-md border border-ink-200 dark:border-ink-300">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink-50 dark:hover:bg-ink-100"
      >
        <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="min-w-[120px] text-xs text-ink-500">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(log.createdAt).toLocaleString()}
            </div>
          </div>
          <div className="min-w-[160px]">
            <div className="text-sm font-medium">
              {log.actorName ?? log.actorId.slice(0, 8)}
            </div>
            <div className="text-xs text-ink-500">{log.actorEmail ?? ""}</div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {log.action}
          </Badge>
          <Badge variant="muted" className="text-[10px]">
            {log.entity}
          </Badge>
          <span className="font-mono text-xs text-ink-500">
            {String(log.entityId).slice(0, 16)}
          </span>
        </div>
        <div className="text-xs text-ink-500">{log.ip ?? ""}</div>
      </button>
      {expanded && (
        <div className="border-t border-ink-200 bg-ink-50 p-3 dark:border-ink-300 dark:bg-ink-100">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium uppercase text-ink-500">
              {t("ডিফ", "Diff")}
            </div>
            <span className="font-mono text-xs text-ink-500">{log.id}</span>
          </div>
          <pre className="overflow-auto rounded bg-white p-2 text-xs dark:bg-ink-50">
            {JSON.stringify(log.diff ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}