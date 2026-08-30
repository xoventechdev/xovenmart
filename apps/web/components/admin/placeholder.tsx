"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function Placeholder({
  titleBn,
  titleEn,
  descBn,
  descEn,
  t,
}: {
  titleBn: string;
  titleEn: string;
  descBn: string;
  descEn: string;
  t: (b: string, e: string) => string;
}) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t(titleBn, titleEn)}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Construction className="h-4 w-4 text-accent-500" />
            {t("শীঘ্রই আসছে", "Coming Soon")}
          </CardTitle>
          <CardDescription>{t(descBn, descEn)}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
