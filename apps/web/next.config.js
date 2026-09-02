/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: `output: "standalone"` is needed only for Docker / single-image deploys.
  // It tries to symlink node_modules at the end of `next build`, which fails on
  // stock Windows without admin / developer-mode. Local `next dev` / `next start`
  // don't need it, so we leave it off by default. To re-enable for a Docker
  // build, run on a system with symlink support (Linux / macOS / WSL) and set
  // NEXT_OUTPUT=standalone.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // ESLint and TypeScript are validated in a separate CI step (`pnpm lint`,
  // `pnpm typecheck`). Running them again inside `next build` is redundant AND
  // causes warnings (react-hooks/exhaustive-deps, @next/next/no-img-element) to
  // fail the build. Disabling here keeps `next build` focused on compilation +
  // page generation, which is what we actually care about for deploys.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // All pages that need to be rendered on-demand (because they depend on
  // runtime auth, localStorage, or live API data) opt out individually
  // via `export const dynamic = "force-dynamic"` in their layout/page.
  // The public-site layout sets it globally so every /[slug] route is
  // covered, and the admin layout does the same for /admin/**.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.xovenmart.com" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "tile.openstreetmap.org" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // placehold.co is used as a fallback image in the seed for banners /
      // categories / products that don't have a real photo uploaded yet.
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
  // Allow large product images
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
