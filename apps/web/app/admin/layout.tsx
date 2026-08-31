import { AdminLayoutClient } from "./layout-client";

/**
 * Server-component admin layout.
 *
 * Sets `dynamic = "force-dynamic"` so the build never tries to prerender
 * /admin/** pages (all of them are client-side, auth-gated, and need
 * runtime API access — prerendering them in CI just hangs).
 *
 * The actual auth check + sidebar rendering lives in the sibling
 * `AdminLayoutClient` (a "use client" component). This split is the
 * canonical Next.js pattern for "I need route segment config in a layout
 * that wants client-side hooks" — `dynamic` and friends are only valid
 * in Server Components.
 */
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
