"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderTree, Package, Folder } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

export default function CategoryTreePage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: cats } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api.get("/admin/categories"),
  });

  const list: any[] = (cats ?? []) as any;
  const roots = list.filter((c) => !c.parentId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("ক্যাটাগরি ট্রি", "Category Tree")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4" /> {t("ক্যাটাগরি কাঠামো", "Category Structure")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {roots.map((c) => {
              const children = list.filter((x) => x.parentId === c.id);
              return (
                <div key={c.id} className="rounded-md border border-ink-200 p-3 dark:border-ink-300">
                  <div className="flex items-center gap-2 font-semibold text-ink-900 dark:text-ink-900">
                    <Folder className="h-4 w-4 text-primary-700" />
                    {lang === "bn" ? c.nameBn : c.nameEn}
                    <span className="ml-2 text-xs text-ink-500">({c._count?.products ?? 0} {t("পণ্য", "products")})</span>
                  </div>
                  {children.length > 0 && (
                    <div className="mt-2 ml-6 space-y-1 border-l-2 border-ink-200 pl-3 dark:border-ink-300">
                      {children.map((ch) => (
                        <div key={ch.id} className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-900">
                          <Package className="h-3 w-3 text-ink-400" />
                          {lang === "bn" ? ch.nameBn : ch.nameEn}
                          <span className="text-xs text-ink-500">({ch._count?.products ?? 0})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
