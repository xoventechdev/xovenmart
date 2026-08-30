# Deploying the Web app to Vercel (free tier)

The web app (`apps/web`) is the storefront + admin panel. Vercel's free
hobby tier handles Next.js deployments automatically, with global edge cache
and free TLS.

## One-time setup

### 1. Push your repo to GitHub
If you haven't already, follow step 6 of `DEPLOY_CPANEL.md` first.

### 2. Create the Vercel project
1. Go to https://vercel.com → Sign in with GitHub
2. **Add New… → Project** → select your monorepo (`xovenmart/xovenmart`)
3. Vercel auto-detects Next.js. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web` ← important; click "Edit" and pick this
   - **Build Command**: leave default (Next.js auto-handles)
   - **Output Directory**: leave default
   - **Install Command**: `cd ../.. && pnpm install --frozen-lockfile --filter @xovenmart/web...`

### 3. Environment variables
Project Settings → **Environment Variables**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.yourdomain.com/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | `https://your-project.vercel.app` |

> The `NEXT_PUBLIC_*` prefix is what Next.js needs to inline the value into
> client-side JS bundles (the API base URL is used by the cart + auth code).

### 4. Deploy
Click **Deploy**. First build takes ~2 minutes (polls pnpm to install the
workspace). Vercel gives you a URL like `https://xovenmart.vercel.app`.

Subsequent deploys happen automatically on every push to `main` that
touches `apps/web/**`.

## Domain setup (optional)

### Use the free `vercel.app` subdomain
Nothing to do. `https://xovenmart.vercel.app` works immediately.

### Use your own domain (`xovenmart.com`)
1. Project → **Settings** → **Domains** → add `xovenmart.com` and `www.xovenmart.com`
2. Vercel shows the DNS records to add. In Cloudflare (or your DNS provider):
   - `xovenmart.com` → A → `76.76.21.21` (Vercel's anycast IP)
   - `www.xovenmart.com` → CNAME → `cname.vercel-dns.com`
3. Vercel auto-issues a Let's Encrypt cert

For the admin panel on a subdomain:
- Add `admin.xovenmart.com` in Vercel Domains
- After it deploys, you can password-protect or restrict by IP at the Vercel
  edge. **But the admin gate is already handled by the API's auth** — `/admin/*`
  requires a valid admin JWT.

## Custom build settings for the monorepo

If Vercel can't resolve workspace deps, set these explicitly in
**Project Settings → General → Build & Development Settings**:

- Install Command:
  ```
  pnpm install --frozen-lockfile --filter @xovenmart/web... --filter @xovenmart/db...
  ```
- Build Command:
  ```
  pnpm --filter @xovenmart/web build
  ```

The triple-dot `...` syntax tells pnpm to include all workspace deps.

## CORS

The web app's `NEXT_PUBLIC_API_BASE_URL` must match a CORS origin allowed by
the API. In your cPanel Node.js app env, set:
```
CORS_ORIGIN=https://xovenmart.vercel.app
```

## What's free vs paid

| Feature | Hobby (free) | Pro ($20/mo) |
|---|---|---|
| Deploys | 100/day | 6,000/day |
| Bandwidth | 100 GB/mo | 1 TB/mo |
| Build minutes | 100/hr | 400/hr |
| Team size | 1 | Unlimited |
| Custom domain | Yes | Yes |
| Password protection | No | Yes |
| Analytics | Basic | Full |

For launch, the hobby tier is plenty. Upgrade if you blow past 100 GB/mo
bandwidth (roughly 50,000 page views).

## Troubleshooting

**Build fails with "Cannot find module '@xovenmart/db'"** — your root install
command isn't pulling workspace deps. Set the Install Command in step 4 above
explicitly.

**API calls from browser fail with CORS** — the API's CORS_ORIGIN doesn't
include your Vercel URL, or you missed the `https://` prefix.

**Customer sees stale product data** — Vercel caches pages at the edge. Bump
revalidation in `app/(public)/page.tsx`:
```ts
export const revalidate = 60; // seconds
```
Or trigger an on-demand revalidation from your admin panel via a webhook
(Vercel supports this on Pro tier; on free, redeploy to clear cache).

**`pnpm` lockfile mismatch** — make sure you're pushing `pnpm-lock.yaml` from
the same machine that built it locally. Re-run `pnpm install` and commit the
lockfile change.