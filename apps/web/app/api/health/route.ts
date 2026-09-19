/**
 * Liveness probe for the Next.js web app.
 *
 * Why this exists:
 *   `infra/Dockerfile.web` declares:
 *     HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1
 *   Docker polls this URL and reports unhealthy if it 404s or times out.
 *   Coolify/Traefik then reads that "unhealthy" status via the docker
 *   provider, removes the container from the load-balancer pool, and
 *   serves its standard 503 page:
 *
 *       no available server
 *
 *   on `https://app.xovenmart.com/`. That is the EXACT message the user
 *   reported. Until this route exists, every healthcheck fails, the
 *   web container is perpetually flagged unhealthy, and Traefik reports
 *   "no available server" for the storefront even when the Next.js
 *   server is happily serving HTML on port 3000 internally.
 *
 * Design:
 *   - `runtime = "nodejs"` so it does NOT use the Edge runtime (Edge
 *     routes can briefly be unavailable during boot, which would make
 *     the healthcheck flakier). The Node runtime is always live once
 *     the server has bound to port 3000.
 *   - `dynamic = "force-dynamic"` so Next.js never tries to cache or
 *     pre-render it — every request runs the handler.
 *   - Body is tiny so `wget -qO-` finishes quickly.
 *   - No external dependencies (no DB, no API call). The probe is
 *     strictly "is the Node server responsive". DB/API health lives on
 *     `https://api.xovenmart.com/api/v1/health`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "web",
      ts: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}
