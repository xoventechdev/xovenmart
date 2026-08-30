"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" defaultLang="bn">
        <I18nProvider defaultLocale="bn">
          {children}
          <Toaster richColors position="top-right" />
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
