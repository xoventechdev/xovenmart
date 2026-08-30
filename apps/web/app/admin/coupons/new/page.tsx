import { redirect } from "next/navigation";

/**
 * REST-style alias for `/admin/coupons/create`. Some links (sidebar,
 * dashboard quick-links) point to `/admin/coupons/new`; this route
 * transparently redirects to the actual page so neither link 404s.
 */
export default function NewCouponAliasPage() {
  redirect("/admin/coupons/create");
}