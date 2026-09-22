import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/**
 * CacheControlInterceptor — sets `Cache-Control` and `Vary` headers
 * on responses so browsers + intermediary CDNs can dedupe repeated
 * fetches across page navigations.
 *
 * Why a single interceptor instead of per-controller `@Header()`:
 *   - One file instead of N decorators — easy to bump the TTL.
 *   - Auto-applied to every controller in `AppModule` so newly added
 *     public endpoints inherit caching for free.
 *   - The allowlist of "public GET" paths is enforced HERE, not at the
 *     route site, so a future auth-protected endpoint can never
 *     accidentally cache a per-user response.
 *
 * Strategy:
 *   - For unauthenticated GETs under `/api/v1/...`, set
 *     `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
 *     60s freshness is the sweet spot — settings/notice/maintenance
 *     changes propagate within a minute, while the browser/CDN still
 *     dedupes rapid-fire navigations.
 *   - For everything else, leave NestJS's default (no Cache-Control).
 *     Auth endpoints stay uncached; per-user responses stay private.
 *
 * Note: NestJS already auto-sets ETag on every response (from the
 * underlying express.static / etag dep), so cached revalidation is
 * already conditional on `If-None-Match`. The interceptor just adds
 * the missing freshness hint so the browser doesn't re-validate
 * during the freshness window.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        if (req.method !== "GET") return;

        const path: string = req.path || req.url || "";
        // Auth endpoints stay uncached — caching a per-user /auth/me
        // or /auth/refresh response would leak across visitors.
        if (path.startsWith("/api/v1/auth/")) return;
        // Admin endpoints stay uncached — they read per-admin state
        // and should never be cached by intermediaries.
        if (path.startsWith("/api/v1/admin/")) return;
        // Cart + checkout + orders are per-user.
        if (
          path.startsWith("/api/v1/cart/") ||
          path.startsWith("/api/v1/checkout/") ||
          path.startsWith("/api/v1/orders/") ||
          path.startsWith("/api/v1/rider/") ||
          path.startsWith("/api/v1/bot/")
        ) {
          return;
        }
        // Everything else (settings/* public, catalog/*, notices/*,
        // delivery/public, public/*, health, ai usage etc.) gets a
        // shared cache. `Vary: Origin` is already set by the CORS
        // middleware; we keep that header so per-origin caching
        // doesn't leak.
        res.setHeader(
          "Cache-Control",
          "public, max-age=60, stale-while-revalidate=300",
        );
      }),
    );
  }
}
