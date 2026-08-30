import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * SEO settings live under the AppSetting table as a single JSON-encoded key
 * "seo" for portability (so existing settings schema/seed doesn't need new columns).
 */
const SEO_KEY = "seo";

const DEFAULT_SEO = {
  // ─── Global defaults ───────────────────────────────────────────
  global: {
    siteName: "XovenMart",
    siteNameBn: "জভেন্টমার্ট",
    siteUrl: "https://xovenmart.com",
    defaultLanguage: "bn",
    separator: "|", // "XovenMart | অনলাইন শপ"
    indexable: true,
    defaultOgImageUrl: "",
    twitterHandle: "@xovenmart",
    facebookPageUrl: "",
    contactEmail: "support@xovenmart.com",
    contactPhone: "+8801720694513",
    addressLocality: "Laksam",
    addressRegion: "Comilla",
    addressCountry: "BD",
    geoLat: 23.7853,
    geoLng: 91.1153,
  },
  // ─── Homepage ─────────────────────────────────────────────────
  homepage: {
    titleBn: "জভেন্টমার্ট — লাকসাম ও কুমিল্লার অনলাইন শপ",
    titleEn: "XovenMart — Online Shopping in Laksam, Cumilla",
    descriptionBn: "মুদাফরগঞ্জ, লাকসাম, কুমিল্লায় সেরা মানের পণ্য সেরা দামে। ক্যাশ অন ডেলিভারি, দ্রুত ডেলিভারি।",
    descriptionEn: "Best quality products at best prices in Mudaforgonj, Laksam, Cumilla. Cash on Delivery, fast delivery.",
    keywords: "online shopping Laksam, online shop Cumilla, COD Laksam, grocery Cumilla",
    ogImageUrl: "",
    canonicalUrl: "https://xovenmart.com",
  },
  // ─── Per-page overrides (slug → SEO meta) ─────────────────────
  pages: {
    about: {
      titleBn: "আমাদের সম্পর্কে — জভেন্টমার্ট",
      titleEn: "About Us — XovenMart",
      descriptionBn: "জভেন্টমার্ট সম্পর্কে জানুন।",
      descriptionEn: "Learn about XovenMart.",
    },
    privacy: {
      titleBn: "গোপনীয়তা নীতি — জভেন্টমার্ট",
      titleEn: "Privacy Policy — XovenMart",
      descriptionBn: "আপনার ডেটা কিভাবে সুরক্ষিত রাখি।",
      descriptionEn: "How we protect your data.",
    },
    terms: {
      titleBn: "ব্যবহারের শর্তাবলী — জভেন্টমার্ট",
      titleEn: "Terms of Service — XovenMart",
      descriptionBn: "আমাদের সেবার শর্তাবলী।",
      descriptionEn: "Terms governing our service.",
    },
    refund: {
      titleBn: "রিফান্ড নীতি — জভেন্টমার্ট",
      titleEn: "Refund Policy — XovenMart",
      descriptionBn: "রিটার্ন ও রিফান্ডের শর্তাবলী।",
      descriptionEn: "Our return and refund terms.",
    },
    shipping: {
      titleBn: "ডেলিভারি নীতি — জভেন্টমার্ট",
      titleEn: "Shipping Policy — XovenMart",
      descriptionBn: "আমাদের ডেলিভারি এলাকা ও চার্জ।",
      descriptionEn: "Delivery zones and charges.",
    },
  },
  // ─── Product page SEO defaults ────────────────────────────────
  products: {
    titleTemplateBn: "{name} কিনুন {price} টাকায় — জভেন্টমার্ট",
    titleTemplateEn: "Buy {name} at ৳{price} — XovenMart",
    descriptionTemplate: "Buy {name} online in Laksam, Cumilla. ৳{salePrice} (MRP ৳{mrp}). Cash on Delivery. Fast delivery.",
    keywords: "buy online Laksam, COD Cumilla",
    enableProductSchema: true,
    enableBreadcrumbSchema: true,
    enableReviewSchema: false,
    autoGenerateAltText: true,
    autoGenerateSlug: true,
  },
  // ─── Sitemap & Robots ────────────────────────────────────────
  sitemap: {
    enabled: true,
    changeFrequency: "daily",
    includeCategories: true,
    includeProducts: true,
    includeStaticPages: true,
    customUrls: [] as { loc: string; changefreq?: string; priority?: number }[],
  },
  robots: {
    enabled: true,
    disallowPaths: ["/admin", "/api", "/checkout", "/cart", "/track"],
    allowPaths: ["/"],
    crawlDelay: 0,
  },
  // ─── Schema.org markup ───────────────────────────────────────
  schema: {
    organization: {
      enabled: true,
      type: "LocalBusiness",
      name: "XovenMart",
      alternateName: "Xovent Mart",
      description: "Online shopping platform serving Laksam and Cumilla area",
      logoUrl: "",
      foundingDate: "2026-01-01",
      priceRange: "৳৳",
    },
    website: {
      enabled: true,
      searchAction: "/search?q={search_term_string}",
    },
    enableProductSchema: true,
    enableBreadcrumbSchema: true,
    enableFaqSchema: true,
    enableLocalBusinessSchema: true,
  },
  // ─── Social sharing (Open Graph + Twitter) ───────────────────
  social: {
    ogSiteName: "XovenMart",
    ogLocale: "bn_BD",
    ogLocaleAlternate: "en_US",
    twitterCard: "summary_large_image",
    twitterSite: "@xovenmart",
    facebookAppId: "",
    defaultOgImageUrl: "",
    defaultOgImageAlt: "XovenMart — Online Shopping in Laksam, Cumilla",
  },
  // ─── Analytics & verification ────────────────────────────────
  analytics: {
    googleAnalyticsId: "",
    googleTagManagerId: "",
    googleSearchConsoleVerification: "",
    bingWebmasterVerification: "",
    facebookPixelId: "",
    enabledUmami: true,
    umamiWebsiteId: "",
    enableSentry: false,
    sentryDsn: "",
  },
  // ─── Sitemap URL submitted to search engines ────────────────
  searchEngines: {
    submitToGoogle: true,
    submitToBing: true,
    googleNewsEnabled: false,
  },
};

@ApiTags("seo")
@Controller("seo")
export class SeoPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("public")
  @ApiOperation({ summary: "Public-safe SEO settings (used by web/app for meta tags)" })
  async publicSettings() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SEO_KEY } });
    let parsed: any = DEFAULT_SEO;
    if (row?.value) {
      try { parsed = { ...DEFAULT_SEO, ...JSON.parse(row.value) }; } catch { /* ignore */ }
    }
    // Never expose verification tokens publicly
    delete parsed.analytics;
    delete parsed.searchEngines;
    return parsed;
  }
}

@ApiTags("admin/seo")
@Controller("admin/seo")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN")
@AdminOnly()
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class SeoAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Get full SEO settings (admin)" })
  async get() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SEO_KEY } });
    if (!row) return DEFAULT_SEO;
    try {
      return { ...DEFAULT_SEO, ...JSON.parse(row.value) };
    } catch {
      return DEFAULT_SEO;
    }
  }

  @Post()
  @ApiOperation({ summary: "Update SEO settings (admin). Merges with existing." })
  async update(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const current = await this.prisma.appSetting.findUnique({ where: { key: SEO_KEY } });
    let merged: any = DEFAULT_SEO;
    if (current?.value) {
      try { merged = { ...DEFAULT_SEO, ...JSON.parse(current.value) }; } catch { /* ignore */ }
    }
    // Deep-merge top-level keys
    for (const k of Object.keys(body)) {
      if (body[k] && typeof body[k] === "object" && !Array.isArray(body[k]) && merged[k] && typeof merged[k] === "object") {
        merged[k] = { ...merged[k], ...body[k] };
      } else {
        merged[k] = body[k];
      }
    }
    await this.prisma.appSetting.upsert({
      where: { key: SEO_KEY },
      update: { value: JSON.stringify(merged), updatedBy: actorId },
      create: { key: SEO_KEY, value: JSON.stringify(merged), updatedBy: actorId },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "seo", entityId: SEO_KEY, action: "update", diff: body },
    });
    return merged;
  }

  @Post("reset")
  @AdminOnly()
  @ApiOperation({ summary: "Reset SEO settings to defaults (ADMIN only)" })
  async reset(@Req() req: Request) {
    const actorId = (req as any).userId;
    await this.prisma.appSetting.upsert({
      where: { key: SEO_KEY },
      update: { value: JSON.stringify(DEFAULT_SEO), updatedBy: actorId },
      create: { key: SEO_KEY, value: JSON.stringify(DEFAULT_SEO), updatedBy: actorId },
    });
    return DEFAULT_SEO;
  }
}