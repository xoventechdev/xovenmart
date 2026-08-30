"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface SeoField {
  /** JSON path inside seo settings, dot-separated, e.g. "global.siteName" */
  path: string;
  labelBn: string;
  labelEn: string;
  type?: "text" | "textarea" | "url" | "email" | "number" | "boolean" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
  hintBn?: string;
  hintEn?: string;
  rows?: number;
}

export interface SeoSection {
  key: string;
  titleBn: string;
  titleEn: string;
  descBn?: string;
  descEn?: string;
  fields: SeoField[];
}

export function SeoPage({
  titleBn,
  titleEn,
  descBn,
  descEn,
  sections,
  /** Top-level key under seo.* to update (e.g., "global", "homepage") */
  scope,
  extraAbove,
  extraBelow,
}: {
  titleBn: string;
  titleEn: string;
  descBn?: string;
  descEn?: string;
  sections: SeoSection[];
  scope?: string;
  extraAbove?: React.ReactNode;
  extraBelow?: React.ReactNode;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: seo, isLoading } = useQuery({
    queryKey: ["admin", "seo"],
    queryFn: () => api.get("/admin/seo"),
  });

  const [values, setValues] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!seo) return;
    // Flatten initial values for current scope sections
    const initial: Record<string, any> = {};
    const get = (path: string) =>
      path.split(".").reduce<any>((o, k) => (o ? o[k] : undefined), seo);
    for (const s of sections) {
      for (const f of s.fields) {
        initial[f.path] = get(f.path);
      }
    }
    setValues(initial);
    setDirty(false);
  }, [seo, sections]);

  const save = useMutation({
    mutationFn: (vars: Record<string, any>) => {
      // Build nested update object from flat path→value map
      const nested: any = {};
      if (scope) nested[scope] = {};
      for (const [path, val] of Object.entries(vars)) {
        const parts = path.split(".");
        const root = scope ? parts[0] === scope ? parts.slice(1) : parts : parts;
        let cur: any = scope ? nested[scope] : nested;
        for (let i = 0; i < root.length - 1; i++) {
          cur[root[i]] = cur[root[i]] ?? {};
          cur = cur[root[i]];
        }
        cur[root[root.length - 1]] = val;
      }
      return api.post("/admin/seo", nested);
    },
    onSuccess: () => {
      toast.success(t("SEO সেটিংস সংরক্ষিত হয়েছে", "SEO settings saved"));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "seo"] });
      qc.invalidateQueries({ queryKey: ["seo", "public"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  const reset = useMutation({
    mutationFn: () => api.post("/admin/seo/reset", {}),
    onSuccess: () => {
      toast.success(t("ডিফল্টে রিসেট হয়েছে", "Reset to defaults"));
      qc.invalidateQueries({ queryKey: ["admin", "seo"] });
    },
  });

  const set = (path: string, val: any) => {
    setValues((s) => ({ ...s, [path]: val }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        <div className="h-48 animate-pulse rounded-md bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t(titleBn, titleEn)}</h1>
          {(descBn || descEn) && (
            <p className="mt-1 text-sm text-ink-500">{t(descBn ?? "", descEn ?? "")}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>
            <RotateCcw className="h-4 w-4" /> {t("রিসেট", "Reset")}
          </Button>
          <Button onClick={() => save.mutate(values)} disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("সংরক্ষণ করুন", "Save")}
          </Button>
        </div>
      </div>

      {dirty && (
        <div className="flex items-center gap-2 rounded-md bg-warning-100 px-3 py-2 text-sm text-warning-700 dark:bg-warning-500/20">
          <AlertTriangle className="h-4 w-4" /> {t("অসংরক্ষিত পরিবর্তন আছে", "You have unsaved changes")}
        </div>
      )}

      {extraAbove}

      {sections.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t(s.titleBn, s.titleEn)}
              <Badge variant="muted" className="font-mono">{s.key}</Badge>
            </CardTitle>
            {(s.descBn || s.descEn) && (
              <CardDescription>{t(s.descBn ?? "", s.descEn ?? "")}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {s.fields.map((f) => (
                <FormField
                  key={f.path}
                  field={f}
                  value={values[f.path]}
                  onChange={(v) => set(f.path, v)}
                  lang={lang}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {extraBelow}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>
          <RotateCcw className="h-4 w-4" /> {t("রিসেট", "Reset")}
        </Button>
        <Button onClick={() => save.mutate(values)} disabled={!dirty || save.isPending}>
          <CheckCircle2 className="h-4 w-4" /> {t("সব সংরক্ষণ করুন", "Save all")}
        </Button>
      </div>
    </div>
  );
}

function FormField({
  field,
  value,
  onChange,
  lang,
}: {
  field: SeoField;
  value: any;
  onChange: (v: any) => void;
  lang: "bn" | "en";
}) {
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isTextarea = field.type === "textarea";
  const isBoolean = field.type === "boolean";
  const isSelect = field.type === "select";

  return (
    <div className={cn("space-y-1.5", isTextarea && "md:col-span-2")}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {t(field.labelBn, field.labelEn)}
      </label>
      {isBoolean ? (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-primary-700 focus:ring-primary-500"
          />
          <span className="text-xs text-ink-500">
            {value ? t("সক্রিয়", "Enabled") : t("নিষ্ক্রিয়", "Disabled")}
          </span>
        </label>
      ) : isSelect ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          type={field.type === "url" ? "url" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
          value={value ?? ""}
          onChange={(e) => {
            const v = field.type === "number" ? Number(e.target.value) : e.target.value;
            onChange(v);
          }}
          placeholder={field.placeholder}
          {...(isTextarea ? { as: "textarea" as any, rows: field.rows ?? 4 } : {})}
          className={cn(isTextarea && "min-h-24 font-mono text-xs")}
        />
      )}
      {(field.hintBn || field.hintEn) && (
        <p className="text-xs text-ink-500">{t(field.hintBn ?? "", field.hintEn ?? "")}</p>
      )}
    </div>
  );
}
