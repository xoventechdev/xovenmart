"use client";

import { Search, Filter, RefreshCw, Download } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface OrderFilterBarProps {
  q: string;
  onQChange: (v: string) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  showExport?: boolean;
  placeholderBn?: string;
  placeholderEn?: string;
}

export function OrderFilterBar({
  q,
  onQChange,
  onRefresh,
  onExport,
  showExport = true,
  placeholderBn = "অর্ডার নং, নাম, ফোন...",
  placeholderEn = "Order #, name, phone...",
}: OrderFilterBarProps) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder={t(placeholderBn, placeholderEn)}
          className="pl-9"
        />
      </div>
      <div className="flex gap-2">
        {onRefresh && (
          <Button variant="outline" size="icon" onClick={onRefresh} title={t("রিফ্রেশ", "Refresh")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        {showExport && onExport && (
          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t("এক্সপোর্ট CSV", "Export CSV")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
