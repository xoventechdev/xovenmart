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
  brandEn: string;
  brandBn: string;
  aboutEn: string;
  aboutBn: string;
  minutes: number;
  labelEn: string;
  labelBn: string;
  zonesEn: string;
  zonesBn: string;
}> {
  const base =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001/api/v1";
  // Fire both requests in parallel — they're independent and both are
  // served from the same /api/v1 base. We tolerate either failing.
  const [deliveryRes, generalRes] = await Promise.allSettled([
    fetch(`${base}/delivery/public`, { next: { revalidate: 300 } }),
    fetch(`${base}/settings/public/general`, { next: { revalidate: 300 } }),
  ]);
  let minutes = 30;
  let labelEn = "30-min delivery";
  let labelBn = "৩০ মিনিটে ডেলিভারি";
  let zonesEn = "all service areas";
  let zonesBn = "সকল সার্ভিস এলাকা";
  if (deliveryRes.status === "fulfilled" && deliveryRes.value.ok) {
    try {
      const data: any = await deliveryRes.value.json();
      minutes = Number(data?.promise?.minutes ?? 30);
      labelEn = (data?.promise?.labelEn ?? "30-min delivery").replace(
        /\d+/g,
        String(minutes),
      );
      labelBn = (data?.promise?.labelBn ?? "৩০ মিনিটে ডেলিভারি").replace(
        /\d+/g,
        String(minutes),
      );
      const zEn = (data?.zones ?? []).map((z: any) => z.nameEn).join(", ");
      const zBn = (data?.zones ?? []).map((z: any) => z.nameBn).join(", ");
      if (zEn) zonesEn = zEn;
      if (zBn) zonesBn = zBn;
    } catch {
      // ignore — keep defaults
    }
  }

  let brandEn = "XovenMart";
  let brandBn = "জোভেনমার্ট";
  let aboutEn =
    "Bangladesh's fastest neighbourhood delivery — groceries, daily essentials, fresh produce, and more.";
  let aboutBn =
    "বাংলাদেশের দ্রুততম প্রতিবেশী ডেলিভারি — মুদি, দৈনন্দিন প্রয়োজনীয় জিনিস, তাজা পণ্য এবং আরও অনেক কিছু।";
  if (generalRes.status === "fulfilled" && generalRes.value.ok) {
    try {
      const data: any = await generalRes.value.json();
      if (data?.store?.nameEn) brandEn = data.store.nameEn;
      if (data?.store?.nameBn) brandBn = data.store.nameBn;
      if (data?.footer?.aboutEn) aboutEn = data.footer.aboutEn;
      if (data?.footer?.aboutBn) aboutBn = data.footer.aboutBn;
    } catch {
      // ignore
    }
  }
  return {
    brandEn,
    brandBn,
    aboutEn,
    aboutBn,
    minutes,
    labelEn,
    labelBn,
    zonesEn,
    zonesBn,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const d = await loadDeliveryMeta();
  const title = `${d.brandEn} — Groceries delivered in ${d.minutes} min | ${d.brandBn} ${d.minutes} মিনিটে`;
  const description = `${d.aboutEn} | ${d.aboutBn}`;
  return {
    title,
    description,
    applicationName: d.brandEn,
    authors: [{ name: d.brandEn }],
    keywords: [
      d.brandEn.toLowerCase(),
      d.brandBn,
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
      title: `${d.brandEn} — Groceries delivered in ${d.minutes} minutes`,
      description: d.aboutEn,
      siteName: d.brandEn,
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hind+Siliguri:wght@300;400;500;600;700&family=Anek+Bangla:wght@400;500;600;700&display=swap"
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
