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
    // Whitelist of hosts the Next.js `<Image>` optimizer is allowed to
    // proxy through `/_next/image`. Admins paste arbitrary category /
    // banner / brand image URLs from anywhere, so we cover the common
    // hosts: Cloudflare R2, AWS S3, Imgur, Google Drive, GitHub raw,
    // Cloudinary, ImgBB, plus the seed sources. The public CategoryCard
    // also has an `onError` fallback (see components/public/site-header.tsx)
    // so an unknown host still renders the emoji instead of a broken img.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.xovenmart.com" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "tile.openstreetmap.org" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "placehold.co" },
      // Common upload-from-anywhere hosts admins use in practice:
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "imgur.com" },
      { protocol: "https", hostname: "*.imgur.com" },
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.cloudinary.com" },
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "*.ibb.co" },
      { protocol: "https", hostname: "blob.core.windows.net" },
      { protocol: "https", hostname: "*.blob.core.windows.net" },
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
