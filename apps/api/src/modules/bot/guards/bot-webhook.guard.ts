import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies the X-Hub-Signature-256 HMAC on Meta (Messenger + WhatsApp
 * Cloud) webhook POSTs. Falls back to query-param token verification
 * for Green API.
 *
 * CRITICAL: this guard MUST run against the RAW body — NestJS's
 * default bodyParser.json() mutates whitespace and key order, which
 * breaks the HMAC. The raw-body middleware in `main.ts` registers
 * BEFORE NestJS's body parser on `/api/v1/bot/webhooks`, so
 * `req.rawBody` is the exact bytes Meta sent.
 *
 * Reference: https://developers.facebook.com/docs/messenger-platform/webhooks#verify-webhook
 */
@Injectable()
export class BotWebhookGuard implements CanActivate {
  private readonly logger = new Logger(BotWebhookGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const url = req.originalUrl || req.url || "";

    // ── Green API uses a shared secret in the query string ───────
    if (url.includes("/bot/webhooks/whatsapp-green")) {
      return this.verifyGreenApi(req);
    }

    // ── Meta uses X-Hub-Signature-256 on every POST ───────────────
    // GETs are the verification handshake (hub.mode=subscribe +
    // hub.verify_token + hub.challenge) and don't carry a signature.
    if (req.method === "GET") return true;

    return this.verifyMeta(req);
  }

  private verifyMeta(req: Request & { rawBody?: Buffer }): boolean {
    const sigHeader =
      (req.header("x-hub-signature-256") ?? req.header("X-Hub-Signature-256") ?? "")
        .toString();
    if (!sigHeader.startsWith("sha256=")) {
      throw new UnauthorizedException("Missing X-Hub-Signature-256 header");
    }
    const expected = sigHeader.slice("sha256=".length).toLowerCase();
    const secret = this.config.get<string>("META_APP_SECRET");
    if (!secret) {
      // Misconfiguration — fail closed. Don't fall back to "allow
      // anything" because an attacker who knows the webhook URL
      // would otherwise be able to spoof events.
      this.logger.error("META_APP_SECRET not set — rejecting webhook");
      throw new UnauthorizedException("Webhook secret not configured");
    }
    const raw = req.rawBody;
    if (!raw || !Buffer.isBuffer(raw)) {
      // Raw-body middleware didn't fire. This is a server-side bug,
      // not a bad request.
      this.logger.error(
        "rawBody missing on Meta webhook — raw-body middleware not mounted?",
      );
      throw new UnauthorizedException("Webhook verification failed");
    }
    const computed = createHmac("sha256", secret).update(raw).digest("hex");
    const ok = this.safeEqual(expected, computed);
    if (!ok) {
      // Log but don't echo the computed value (would let an attacker
      // brute-force the secret).
      this.logger.warn(
        `Meta webhook signature mismatch path=${req.path} ua=${req.header("user-agent") ?? "?"}`,
      );
      throw new UnauthorizedException("Invalid webhook signature");
    }
    return true;
  }

  private verifyGreenApi(req: Request): boolean {
    // Green API: shared secret in the `token` query param. Per the
    // service's docs (https://green-api.com), the secret is set when
    // the webhook is configured and we trust the value verbatim.
    const url = new URL(req.originalUrl, "http://localhost");
    const token = url.searchParams.get("token");
    const expected = this.config.get<string>("GREEN_API_TOKEN");
    if (!expected) {
      this.logger.error("GREEN_API_TOKEN not set — rejecting webhook");
      throw new UnauthorizedException("Webhook secret not configured");
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException("Invalid webhook token");
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
    } catch {
      return false;
    }
  }
}
