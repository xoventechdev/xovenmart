import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

// Fonts are loaded at runtime via the <link> tags below. We intentionally do
// NOT use next/font/google here because that fetches the font files at BUILD
// time — which fails in offline / sandboxed CI runners that have no
// outbound access to fonts.gstatic.com. The CSS variables in globals.css
// already have solid system-font fallbacks, so the site renders fine even
// before the Google Fonts CSS finishes loading.

/**
 * Server-side fetch of the admin-editable delivery marketing payload so the
 * SEO <title> + <meta description> + OpenGraph tags can include the
 * admin-configured promise minutes / zone names. If the API is unreachable
 * (e.g. during prerender in CI) we fall back to the original hardcoded
 * English/Bengali copy.
 */
async function loadDeliveryMeta(): Promise<{
  minutes: number;
  labelEn: string;
  labelBn: string;
  zonesEn: string;
  zonesBn: string;
}> {
  try {
    const base =
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001/api/v1";
    const res = await fetch(`${base}/delivery/public`, {
      // Re-fetch every 5 min at most so dev hot-reload picks up admin edits.
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error("delivery/public not ok");
    const data = await res.json();
    const mins = Number(data?.promise?.minutes ?? 30);
    const labelEn = (data?.promise?.labelEn ?? "30-min delivery").replace(
      /\d+/g,
      String(mins),
    );
    const labelBn = (data?.promise?.labelBn ?? "৩০ মিনিটে ডেলিভারি").replace(
      /\d+/g,
      String(mins),
    );
    const zonesBn = (data?.zones ?? [])
      .map((z: any) => z.nameBn)
      .join(", ");
    const zonesEn = (data?.zones ?? [])
      .map((z: any) => z.nameEn)
      .join(", ");
    return { minutes: mins, labelEn, labelBn, zonesBn, zonesEn };
  } catch {
    return {
      minutes: 30,
      labelEn: "30-min delivery",
      labelBn: "৩০ মিনিটে ডেলিভারি",
      zonesEn: "all service areas",
      zonesBn: "সকল সার্ভিস এলাকা",
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const d = await loadDeliveryMeta();
  const title = `XovenMart — Groceries delivered in ${d.minutes} min | মুদি ${d.minutes} মিনিটে`;
  const description = `Fresh groceries and daily essentials across ${d.zonesEn}, delivered in ${d.minutes} minutes. | ${d.zonesBn}-এ ${d.minutes} মিনিটে তাজা পণ্য।`;
  return {
    title,
    description,
    applicationName: "XovenMart",
    authors: [{ name: "XovenMart" }],
    keywords: [
      "xovenmart",
      "জোভেনমার্ট",
      "laksam",
      "cumilla",
      "grocery",
      "delivery",
    ],
    icons: {
      icon: [{ url: "/logo.png", type: "image/png", sizes: "any" }],
      apple: [{ url: "/logo.png", sizes: "any" }],
    },
    openGraph: {
      title: `XovenMart — Groceries delivered in ${d.minutes} minutes`,
      description: `Fresh groceries and daily essentials across ${d.zonesEn}, in ${d.minutes} minutes.`,
      siteName: "XovenMart",
      locale: "en_US",
      type: "website",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1A3D" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        {/* Theme + lang init: prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Runtime font loading — kept OUT of next/font/google so builds work
            in offline CI runners. The CSS variables in globals.css fall back
            to system-ui / Noto Sans Bengali while Google Fonts loads. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hind+Siliguri:wght@300;400;500;600;700&display=swap"
        />
      </head>
      {/* suppressHydrationWarning on <body>: some browser extensions
          (Avast/AVG "BIS", password managers, dark-mode injectors) add
          attributes like `bis_register` or `bis_skin_checked` after
          React has streamed the HTML. Without this attribute React logs
          a noisy hydration mismatch warning on every page. */}
      <body
        suppressHydrationWarning
        className={`font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
