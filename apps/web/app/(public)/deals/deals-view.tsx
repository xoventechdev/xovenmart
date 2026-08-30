"use client";

import { Tag } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";

/**
 * Client view for the deals page. Server-side data fetch lives in `page.tsx`.
 * Re-renders bilingual copy when the user toggles the language.
 */
export function DealsView({ items }: { items: any[] }) {
  const { lang } = useTheme();
  const tw = useTwin();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="text-center mb-8">
        <Tag className="h-10 w-10 text-red-500 mx-auto mb-2" />
        <h1 className="text-2xl md:text-3xl font-bold">
          {tw("সেরা অফার ও ছাড়", "Best deals & discounts")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {lang === "en"
            ? `${items.length} product${items.length === 1 ? "" : "s"} on sale right now`
            : `${items.length}টি পণ্যে বিশেষ ছাড় চলছে`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((p: any) => (
          <ProductCard key={p.id} product={p} variant="compact" />
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          {tw(
            "এখন কোনো অফার নেই। শীঘ্রই আসছে!",
            "No offers right now. Coming soon!",
          )}
        </div>
      )}
    </div>
  );
}