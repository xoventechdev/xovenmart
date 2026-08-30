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
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
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
