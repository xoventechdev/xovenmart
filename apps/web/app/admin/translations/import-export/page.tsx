"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * /admin/translations/import-export — placeholder.
 * Redirects to the main translations page where the import/export
 * modals live.
 */
export default function ImportExportPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/translations");
  }, [router]);

  return (
    <div className="flex items-center justify-center p-12 text-ink-400">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
