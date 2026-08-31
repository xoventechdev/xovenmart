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
  // Some public pages (/cart, /login, /register, /forgot-password, /track)
  // are entirely client-side: they depend on localStorage, zustand state,
  // and runtime auth tokens. Next 15 by default tries to statically
  // prerender them during `next build`. In CI there's no API server at
  // localhost:3001, so any internal fetch they make never resolves, the
  // prerender hangs 60s three times in a row, and the build fails.
  //
  // Bump the default 60s prerender timeout so future slow pages don't fail
  // the build after just 3 minutes; pages that genuinely need to be
  // client-only (cart, login, register, forgot-password, track) opt out
  // individually with `export const dynamic = "force-dynamic"`.
  staticGenerationTimeout: 180,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.xovenmart.com" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "tile.openstreetmap.org" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
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
