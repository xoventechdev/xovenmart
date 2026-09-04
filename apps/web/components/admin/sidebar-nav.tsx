"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Tag,
  Users,
  Package,
  LayoutDashboard,
  Truck,
  Ticket,
  MapPin,
  BarChart3,
  ShieldCheck,
  Settings as SettingsIcon,
  Globe,
  Bell,
  Wallet,
  Megaphone,
  Star,
  Wrench,
  Boxes,
  ChevronDown,
  ChevronRight,
  LogOut,
  Image as ImageIcon,
  Store,
  Mail,
  Search,
  UserCog,
  Receipt,
  Languages,
  Building2,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";

interface NavChild {
  href: string;
  labelBn: string;
  labelEn: string;
  badge?: "new" | "soon";
}
interface NavModule {
  id: string;
  href?: string;
  labelBn: string;
  labelEn: string;
  icon: any;
  children?: NavChild[];
  badge?: "new" | "soon";
}

const NAV_MODULES: NavModule[] = [
  {
    id: "dashboard",
    href: "/admin",
    labelBn: "ড্যাশবোর্ড",
    labelEn: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "orders",
    labelBn: "অর্ডার মডিউল",
    labelEn: "Orders Module",
    icon: ShoppingCart,
    children: [
      { href: "/admin/orders/all", labelBn: "সব অর্ডার", labelEn: "All Orders" },
      { href: "/admin/orders/pending", labelBn: "নতুন অর্ডার", labelEn: "Pending" },
      { href: "/admin/orders/processing", labelBn: "প্রস্তুত হচ্ছে", labelEn: "Preparing" },
      { href: "/admin/orders/dispatch", labelBn: "ডেলিভারি", labelEn: "Out for Delivery" },
      { href: "/admin/orders/delivered", labelBn: "ডেলিভারি সম্পন্ন", labelEn: "Delivered" },
      { href: "/admin/orders/returns", labelBn: "ফেরত / রিটার্ন", labelEn: "Returns" },
      { href: "/admin/orders/refunds", labelBn: "ফেরত টাকা", labelEn: "Refunds" },
      { href: "/admin/orders/cancelled", labelBn: "বাতিল", labelEn: "Cancelled" },
    ],
  },
  {
    id: "pos",
    href: "/admin/pos",
    labelBn: "POS / দ্রুত অর্ডার",
    labelEn: "POS / Quick Order",
    icon: Calculator,
    badge: "new",
  },
  {
    id: "products",
    labelBn: "পণ্য মডিউল",
    labelEn: "Products Module",
    icon: Package,
    children: [
      { href: "/admin/products", labelBn: "সব পণ্য", labelEn: "All Products" },
      { href: "/admin/products/new", labelBn: "পণ্য যোগ করুন", labelEn: "Add Product" },
      { href: "/admin/products/featured", labelBn: "ফিচার্ড পণ্য", labelEn: "Featured" },
      { href: "/admin/products/inactive", labelBn: "নিষ্ক্রিয়", labelEn: "Inactive" },
      { href: "/admin/products/bulk-import", labelBn: "বাল্ক ইমপোর্ট", labelEn: "Bulk Import" },
    ],
  },
  {
    id: "categories",
    labelBn: "ক্যাটাগরি মডিউল",
    labelEn: "Categories Module",
    icon: Tag,
    children: [
      { href: "/admin/categories", labelBn: "সব ক্যাটাগরি", labelEn: "All Categories" },
      { href: "/admin/categories/new", labelBn: "ক্যাটাগরি যোগ", labelEn: "Add Category" },
      { href: "/admin/categories/tree", labelBn: "ক্যাটাগরি ট্রি", labelEn: "Category Tree" },
    ],
  },
  {
    id: "suppliers",
    labelBn: "সরবরাহকারী মডিউল",
    labelEn: "Suppliers Module",
    icon: Building2,
    children: [
      { href: "/admin/suppliers", labelBn: "সব সরবরাহকারী", labelEn: "All Suppliers" },
      { href: "/admin/suppliers/new", labelBn: "সরবরাহকারী যোগ", labelEn: "Add Supplier" },
      { href: "/admin/suppliers/active", labelBn: "সক্রিয়", labelEn: "Active" },
    ],
  },
  {
    id: "inventory",
    labelBn: "ইনভেন্টরি মডিউল",
    labelEn: "Inventory Module",
    icon: Boxes,
    children: [
      { href: "/admin/inventory", labelBn: "স্টক লেভেল", labelEn: "Stock Levels" },
      { href: "/admin/inventory/low-stock", labelBn: "কম স্টক", labelEn: "Low Stock" },
      { href: "/admin/inventory/movements", labelBn: "স্টক মুভমেন্ট", labelEn: "Stock Movements" },
      { href: "/admin/inventory/adjust", labelBn: "স্টক অ্যাডজাস্ট", labelEn: "Adjust Stock" },
    ],
  },
  {
    id: "customers",
    labelBn: "কাস্টমার মডিউল",
    labelEn: "Customers Module",
    icon: Users,
    children: [
      { href: "/admin/customers", labelBn: "সব কাস্টমার", labelEn: "All Customers" },
      { href: "/admin/customers/blocked", labelBn: "ব্লকড", labelEn: "Blocked" },
      { href: "/admin/customers/referrals", labelBn: "রেফারেল", labelEn: "Referrals" },
      { href: "/admin/customers/rewards", labelBn: "রিওয়ার্ড", labelEn: "Rewards" },
      { href: "/admin/customers/addresses", labelBn: "অ্যাড্রেস", labelEn: "Addresses" },
    ],
  },
  {
    id: "riders",
    labelBn: "রাইডার মডিউল",
    labelEn: "Riders Module",
    icon: Truck,
    children: [
      { href: "/admin/riders", labelBn: "সব রাইডার", labelEn: "All Riders" },
      { href: "/admin/riders/new", labelBn: "রাইডার যোগ", labelEn: "Add Rider" },
      { href: "/admin/riders/active", labelBn: "সক্রিয়", labelEn: "Active" },
      { href: "/admin/riders/cash", labelBn: "ক্যাশ সেটেলমেন্ট", labelEn: "Cash Settlements" },
      { href: "/admin/riders/floats", labelBn: "ফ্লোট", labelEn: "Rider Floats" },
    ],
  },
  {
    id: "hr",
    labelBn: "HR মডিউল",
    labelEn: "HR Module",
    icon: UserCog,
    children: [
      { href: "/admin/hr/riders/salary", labelBn: "রাইডার বেতন", labelEn: "Rider Salary" },
      { href: "/admin/hr/riders/payouts", labelBn: "রাইডার পেমেন্ট", labelEn: "Rider Payouts" },
      { href: "/admin/hr/riders/advances", labelBn: "অগ্রিম", labelEn: "Advances" },
      { href: "/admin/hr/staff/salary", labelBn: "স্টাফ বেতন", labelEn: "Staff Salary" },
      { href: "/admin/hr/staff/advances", labelBn: "স্টাফ অগ্রিম", labelEn: "Staff Advances" },
    ],
  },
  {
    id: "expenses",
    labelBn: "খরচ মডিউল",
    labelEn: "Expenses Module",
    icon: Receipt,
    children: [
      { href: "/admin/expenses/all", labelBn: "সব খরচ", labelEn: "All Expenses" },
      { href: "/admin/expenses/add", labelBn: "খরচ যোগ", labelEn: "Add Expense" },
      { href: "/admin/expenses/categories", labelBn: "ক্যাটাগরি", labelEn: "Categories" },
      { href: "/admin/expenses/report", labelBn: "রিপোর্ট", labelEn: "Expense Report" },
    ],
  },
  {
    id: "coupons",
    labelBn: "প্রোমো/কুপন মডিউল",
    labelEn: "Promo/Coupon Module",
    icon: Ticket,
    children: [
      { href: "/admin/coupons", labelBn: "সব কুপন", labelEn: "All Coupons" },
      { href: "/admin/coupons/new", labelBn: "কুপন তৈরি", labelEn: "Create Coupon" },
      { href: "/admin/coupons/active", labelBn: "সক্রিয় কুপন", labelEn: "Active" },
      { href: "/admin/coupons/redemptions", labelBn: "রিডেম্পশন", labelEn: "Redemptions" },
    ],
  },
  {
    id: "delivery-zones",
    labelBn: "ডেলিভারি জোন",
    labelEn: "Delivery Zones",
    icon: MapPin,
    children: [
      { href: "/admin/delivery-zones", labelBn: "সব জোন", labelEn: "All Zones" },
      { href: "/admin/delivery-zones/new", labelBn: "নতুন জোন", labelEn: "Add Zone" },
      { href: "/admin/delivery-zones/fees", labelBn: "ডেলিভারি ফি", labelEn: "Fee Rules" },
    ],
  },
  {
    id: "translations",
    labelBn: "অনুবাদ মডি�ল",
    labelEn: "Translations Module",
    icon: Languages,
    children: [
      { href: "/admin/translations", labelBn: "সব অনুবাদ", labelEn: "All Translations" },
      { href: "/admin/translations/new", labelBn: "নতুন কী", labelEn: "Add Key" },
      { href: "/admin/translations/import-export", labelBn: "ইমপোর্ট / এক্সপোর্ট", labelEn: "Import / Export" },
    ],
  },
  {
    id: "payments",
    labelBn: "পেমেন্ট মডিউল",
    labelEn: "Payments Module",
    icon: Wallet,
    children: [
      { href: "/admin/payments", labelBn: "লেনদেন", labelEn: "Transactions" },
      { href: "/admin/payments/cod", labelBn: "COD ভেরিফাই", labelEn: "Verify COD" },
      { href: "/admin/payments/refunds", labelBn: "রিফান্ড প্রসেস", labelEn: "Process Refunds" },
    ],
  },
  {
    id: "marketing",
    labelBn: "মার্কেটিং মডিউল",
    labelEn: "Marketing Module",
    icon: Megaphone,
    children: [
      { href: "/admin/marketing/banners", labelBn: "ব্যানার", labelEn: "Banners" },
      { href: "/admin/marketing/notices", labelBn: "নোটিশ", labelEn: "Notices" },
      { href: "/admin/marketing/deals", labelBn: "ডিল পেজ", labelEn: "Deals Page" },
      { href: "/admin/marketing/campaigns", labelBn: "ক্যাম্পেইন", labelEn: "Campaigns" },
      { href: "/admin/marketing/broadcast", labelBn: "ব্রডকাস্ট", labelEn: "Broadcast Message" },
    ],
  },
  {
    id: "notifications",
    labelBn: "নোটিফিকেশন মডিউল",
    labelEn: "Notifications Module",
    icon: Bell,
    children: [
      { href: "/admin/notifications", labelBn: "সব নোটিফিকেশন", labelEn: "All Notifications" },
      { href: "/admin/notifications/templates", labelBn: "টেমপ্লেট", labelEn: "Templates" },
      { href: "/admin/notifications/push", labelBn: "পুশ", labelEn: "Push" },
      { href: "/admin/notifications/sms", labelBn: "SMS লগ", labelEn: "SMS Log" },
      { href: "/admin/notifications/email", labelBn: "ইমেইল লগ", labelEn: "Email Log" },
    ],
  },
  {
    id: "support",
    labelBn: "সাপোর্ট মডিউল",
    labelEn: "Support Module",
    icon: ShieldCheck,
    children: [
      { href: "/admin/support/tickets", labelBn: "টিকিট", labelEn: "Tickets" },
      // /admin/support/faqs was removed when FAQs moved to
      // `/admin/public-site/faq` (single source of truth, backed by
      // `site-pages/faqs.controller.ts`). The old page existed but hit
      // a non-existent endpoint, so the sidebar link was a guaranteed
      // 404. Kept this comment so a future contributor doesn't re-add
      // it by analogy with `tickets`.
    ],
  },
  {
    id: "media",
    labelBn: "মিডিয়া লাইব্রেরি",
    labelEn: "Media Library",
    icon: ImageIcon,
    children: [
      { href: "/admin/media/images", labelBn: "ছবি", labelEn: "Images" },
      { href: "/admin/media/upload", labelBn: "আপলোড", labelEn: "Upload" },
    ],
  },
  {
    id: "reports",
    labelBn: "রিপোর্ট মডিউল",
    labelEn: "Reports Module",
    icon: BarChart3,
    children: [
      { href: "/admin/reports/sales", labelBn: "বিক্রয়", labelEn: "Sales Report" },
      { href: "/admin/reports/orders", labelBn: "অর্ডার", labelEn: "Orders Report" },
      { href: "/admin/reports/products", labelBn: "পণ্য", labelEn: "Product Report" },
      { href: "/admin/reports/customers", labelBn: "কাস্টমার", labelEn: "Customer Report" },
      { href: "/admin/reports/riders", labelBn: "রাইডার পারফরম্যান্স", labelEn: "Rider Performance" },
      { href: "/admin/reports/payments", labelBn: "পেমেন্ট", labelEn: "Payment Report" },
      { href: "/admin/reports/cod", labelBn: "ক্যাশ রিপোর্ট", labelEn: "Cash Collection" },
      { href: "/admin/reports/referrals", labelBn: "রেফারেল", labelEn: "Referral Performance" },
      { href: "/admin/reports/low-stock", labelBn: "লো-স্টক", labelEn: "Low Stock Report" },
    ],
  },
  {
    id: "audit",
    labelBn: "অডিট মডিউল",
    labelEn: "Audit Module",
    icon: ShieldCheck,
    children: [
      { href: "/admin/audit/logs", labelBn: "অডিট লগ", labelEn: "Audit Logs" },
      { href: "/admin/audit/admin", labelBn: "অ্যাডমিন অ্যাকশন", labelEn: "Admin Actions" },
      { href: "/admin/audit/rider", labelBn: "রাইডার অ্যাকশন", labelEn: "Rider Actions" },
    ],
  },
  {
    id: "seo",
    labelBn: "SEO মডিউল",
    labelEn: "SEO Module",
    icon: Search,
    children: [
      { href: "/admin/seo/global", labelBn: "গ্লোবাল সেটিংস", labelEn: "Global SEO Settings" },
      { href: "/admin/seo/homepage", labelBn: "হোমপেজ SEO", labelEn: "Homepage SEO" },
      { href: "/admin/seo/pages", labelBn: "পেজ SEO", labelEn: "Page-level SEO" },
      { href: "/admin/seo/products", labelBn: "পণ্য SEO", labelEn: "Product SEO Defaults" },
      { href: "/admin/seo/sitemap", labelBn: "সাইটম্যাপ", labelEn: "Sitemap & Robots" },
      { href: "/admin/seo/schema", labelBn: "স্কিমা মার্কআপ", labelEn: "Schema Markup" },
      { href: "/admin/seo/social", labelBn: "সোশ্যাল শেয়ার", labelEn: "Social Sharing (OG)" },
      { href: "/admin/seo/analytics", labelBn: "অ্যানালিটিক্স", labelEn: "Analytics & Verification" },
    ],
  },
  {
    id: "system",
    labelBn: "সিস্টেম মডিউল",
    labelEn: "System Module",
    icon: Wrench,
    children: [
      { href: "/admin/system/settings", labelBn: "অ্যাডমিন সেটিংস", labelEn: "Admin Panel Settings" },
      { href: "/admin/system/feature-toggles", labelBn: "ফিচার টগল", labelEn: "Feature Toggles" },
      { href: "/admin/system/smtp", labelBn: "SMTP ইমেইল", labelEn: "SMTP / Email" },
      { href: "/admin/system/referrals", labelBn: "রেফারেল সেটিংস", labelEn: "Referral Rewards" },
      { href: "/admin/system/auth", labelBn: "অথ সেটিংস", labelEn: "Auth Settings (OTP/Guest/Email)" },
      { href: "/admin/system/backups", labelBn: "ব্যাকআপ", labelEn: "Backups" },
      { href: "/admin/system/staff", labelBn: "স্টাফ / অ্যাডমিন", labelEn: "Staff & Admins" },
      { href: "/admin/system/maintenance", labelBn: "মেইনটেন্যান্স", labelEn: "Maintenance" },
      { href: "/admin/system/api-health", labelBn: "API স্বাস্থ্য", labelEn: "API Health" },
    ],
  },
  {
    id: "templates",
    labelBn: "টেমপ্লেট মডিউল",
    labelEn: "Templates Module",
    icon: Mail,
    children: [
      { href: "/admin/templates/email", labelBn: "ইমেইল টেমপ্লেট", labelEn: "Email Templates" },
      { href: "/admin/templates/sms", labelBn: "SMS টেমপ্লেট", labelEn: "SMS Templates" },
      { href: "/admin/templates/push", labelBn: "পুশ টেমপ্লেট", labelEn: "Push Templates" },
      { href: "/admin/templates/order-updates", labelBn: "অর্ডার আপডেট", labelEn: "Order Updates" },
      { href: "/admin/templates/promotional", labelBn: "প্রমোশনাল", labelEn: "Promotional" },
    ],
  },
  {
    id: "public-site",
    labelBn: "পাবলিক সাইট মডিউল",
    labelEn: "Public Site Module",
    icon: Globe,
    children: [
      { href: "/admin/public-site/homepage", labelBn: "হোমপেজ", labelEn: "Homepage Banners" },
      { href: "/admin/public-site/deals", labelBn: "ডিল পেজ", labelEn: "Deals Configuration" },
      { href: "/admin/public-site/about", labelBn: "আমাদের সম্পর্কে", labelEn: "About Page" },
      { href: "/admin/public-site/contact", labelBn: "যোগাযোগ", labelEn: "Contact Info" },
      { href: "/admin/public-site/pages", labelBn: "পেজ ম্যানেজার", labelEn: "Pages (Privacy/Terms)" },
      { href: "/admin/public-site/faq", labelBn: "প্রায়শই জিজ্ঞাসা", labelEn: "FAQ Page" },
      { href: "/admin/public-site/footer", labelBn: "ফুটার", labelEn: "Footer Links" },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, toggleTheme, toggleLang } = useTheme();
  const general = useGeneralSettingsSafe();

  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    api.setAudience("admin");
    if (!api.isAuthenticated()) return;
    api.get("/auth/me").then(setMe).catch(() => {});
  }, []);

  const role = me?.admin?.role as "ADMIN" | "MANAGER" | undefined;
  const isManager = role === "MANAGER";

  /** Modules hidden from MANAGER (technical/admin-only). */
  const TECH_MODULE_IDS = new Set(["audit", "seo"]);

  /** Children hidden from MANAGER (technical sub-pages). */
  const TECH_CHILD_HREFS = new Set([
    "/admin/system/settings",
    "/admin/system/feature-toggles",
    "/admin/system/smtp",
    "/admin/system/referrals",
    "/admin/system/auth",
    "/admin/system/backups",
    "/admin/system/staff",
    "/admin/system/maintenance",
    "/admin/system/api-health",
    "/admin/public-site/pages", // legal pages — ADMIN only
  ]);

  const visibleModules = NAV_MODULES.filter((m) => !(isManager && TECH_MODULE_IDS.has(m.id))).map((m) => ({
    ...m,
    children: m.children?.filter((c) => !(isManager && TECH_CHILD_HREFS.has(c.href))),
  }));

  const [openModules, setOpenModules] = useState<string[]>(() => {
    // Strip trailing path segments that are list-view tabs so the parent
    // route matches even when a child tab is active.
    const subRoutes =
      "(all|new|pending|processing|dispatch|delivered|returns|refunds|cancelled|featured|inactive|active|blocked|low-stock|movements|adjust|cash|floats|redemptions|tree|tickets|images|upload|sales|orders|products|customers|riders|payments|cod|referrals|logs|admin-actions|rider-actions|settings|staff|maintenance|api-health|homepage|deals|about|contact|footer|seo|templates|push|sms|email|bulk-import|lookup|order-updates|promotional|pages|faq|footer|schema|sitemap|social|analytics|categories|global|backups)";
    const initial = visibleModules
      .filter(
        (m) =>
          (m.children &&
            m.children.some((c) =>
              pathname.startsWith(c.href.replace(new RegExp(`/${subRoutes}$`), "")),
            )) ||
          m.href === pathname,
      )
      .map((m) => m.id);
    return initial;
  });
  const [collapsed, setCollapsed] = useState(false);

  // Keep current module expanded on path change
  useEffect(() => {
    const parent = visibleModules.find(
      (m) => m.children && m.children.some((c) => pathname.startsWith(c.href.split("?")[0]))
    );
    if (parent && !openModules.includes(parent.id)) {
      setOpenModules((s) => [...s, parent.id]);
    }
  }, [pathname, openModules]);

  const toggle = (id: string) => {
    setOpenModules((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r border-ink-200 bg-primary-900 text-white transition-all duration-200 dark:border-ink-300 dark:bg-primary-950 dark:text-ink-50",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo — admin-controllable. Uses general.brand.logoDarkUrl (white-bg
          needed on dark sidebar), falls back to logoUrl, then BrandMark. */}
      <div className="flex h-16 items-center gap-3 border-b border-primary-800 px-4 dark:border-ink-700">
        <Link href="/admin" aria-label="XovenMart admin home" className="shrink-0">
          {general.brand.logoDarkUrl || general.brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={general.brand.logoDarkUrl || general.brand.logoUrl}
              alt="XovenMart"
              className="object-contain"
              style={{ height: 36, width: "auto", maxWidth: 140 }}
            />
          ) : (
            <BrandMark size={36} />
          )}
        </Link>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-bold text-white dark:text-ink-50">XovenMart</div>
            <div className="truncate text-xs text-primary-200 dark:text-ink-500">
              {isManager ? t("ম্যানেজার প্যানেল", "Manager Panel") : t("অ্যাডমিন প্যানেল", "Admin Panel")}
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleModules.map((m) => {
          const Icon = m.icon;
          const isExpanded = openModules.includes(m.id);
          const hasChildren = !!m.children?.length;

          if (!hasChildren) {
            const active = pathname === m.href;
            return (
              <Link
                key={m.id}
                href={m.href!}
                className={cn(
                  "mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-500 text-white"
                    : "text-primary-100 hover:bg-primary-800 dark:text-primary-200 dark:hover:bg-primary-800"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{t(m.labelBn, m.labelEn)}</span>}
              </Link>
            );
          }

          return (
            <div key={m.id} className="mb-1">
              <button
                onClick={() => toggle(m.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "text-primary-100 hover:bg-primary-800 dark:text-primary-200 dark:hover:bg-primary-800"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{t(m.labelBn, m.labelEn)}</span>
                    {m.badge === "new" && (
                      <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
                    )}
                    {m.badge === "soon" && (
                      <span className="rounded-full bg-primary-700 px-2 py-0.5 text-[10px] text-primary-100 dark:bg-primary-700 dark:text-primary-200">SOON</span>
                    )}
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </>
                )}
              </button>
              {isExpanded && !collapsed && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-primary-800 pl-2 dark:border-primary-700">
                  {m.children!.map((c) => {
                    const active = pathname === c.href;
                    return (
                      <Link
                        key={c.href}
                        href={c.href}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-xs transition-colors",
                          active
                            ? "bg-accent-500 text-white"
                            : "text-primary-200 hover:bg-primary-800 hover:text-white dark:text-primary-200 dark:hover:bg-primary-700 dark:hover:text-white"
                        )}
                      >
                        {t(c.labelBn, c.labelEn)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="border-t border-primary-800 p-3 dark:border-primary-700">
        {!collapsed && (
          <div className="mb-2 flex gap-1">
            <button onClick={toggleLang} className="flex-1 rounded-md bg-primary-800 px-2 py-1.5 text-xs hover:bg-primary-700 dark:bg-primary-800 dark:hover:bg-primary-700 dark:text-ink-50">
              {lang === "bn" ? "EN" : "বাং"}
            </button>
            <button onClick={toggleTheme} className="flex-1 rounded-md bg-primary-800 px-2 py-1.5 text-xs hover:bg-primary-700 dark:bg-primary-800 dark:hover:bg-primary-700 dark:text-ink-50">
              {lang === "bn" ? "ডার্ক" : "Dark"}
            </button>
          </div>
        )}
        <button
          onClick={() => {
            api.clearTokens();
            router.push("/admin/login");
          }}
          className="flex w-full items-center gap-2 rounded-md bg-primary-800 px-3 py-2 text-xs font-medium text-white hover:bg-danger-500 dark:bg-primary-800 dark:text-ink-50"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>{lang === "bn" ? "লগআউট" : "Logout"}</span>}
        </button>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-primary-200 hover:text-white dark:text-primary-300 dark:hover:text-white"
          >
            {lang === "bn" ? "সাইডবার সংকুচিত করুন" : "Collapse sidebar"}
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute bottom-20 left-2 rounded-md bg-primary-800 p-2 text-white hover:bg-primary-700 dark:bg-primary-800 dark:text-ink-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </aside>
  );
}
