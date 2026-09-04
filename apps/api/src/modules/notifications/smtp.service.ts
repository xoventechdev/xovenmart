import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailPurpose, SmtpProvider, SmtpEncryption } from "@prisma/client";
import { createTransport, Transporter, SendMailOptions } from "nodemailer";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SecretsService } from "../../shared/crypto/secrets.service";

export interface SendMailArgs {
  purpose?: EmailPurpose;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /**
   * Optional nodemailer attachments (e.g. .sql.gz backup files). Forwarded
   * verbatim into `transport.sendMail(...)`. We re-use nodemailer's own
   * `SendMailOptions['attachments']` type so any of the supported shapes
   * (`{ filename, content, contentType }`, `{ path }`, etc.) work without
   * us inventing a parallel schema. Optional today; only the backup
   * notification path uses it.
   */
  attachments?: SendMailOptions["attachments"];
}

export interface SendMailResult {
  ok: true;
  messageId: string;
  providerId: string | null;
  mode: "db" | "env" | "dev";
}

interface ResolvedProvider {
  id: string | null;            // null for env-fallback
  host: string;
  port: number;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
  encryption: SmtpEncryption;
  rejectUnauthorized: boolean;
  label: string;
  mode: "db" | "env";
}

/**
 * SMTP delivery — admin-managed providers + env fallback.
 *
 * Resolution order for `pickProviderFor(purpose)`:
 *   1. SmtpPurposeAssignment row for the purpose + provider is active
 *   2. Provider with `isDefault = true` + `isActive = true`
 *   3. SMTP_DEV_* env vars (only when NODE_ENV != 'production')
 *   4. Throw 503 (in production) or log-only (in dev)
 *
 * Transports are cached by providerId so re-using the same provider
 * doesn't re-handshake TLS for every send. The cache is invalidated
 * whenever a provider row is updated, deleted, or flipped to inactive.
 */
@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);
  private readonly transportCache = new Map<string, Transporter>();
  private readonly isProduction: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
  ) {
    this.isProduction = (config.get<string>("NODE_ENV") || "development") === "production";
  }

  /** Drop a cached transporter — call after update/delete/activate toggles. */
  invalidateTransport(providerId: string) {
    const cached = this.transportCache.get(providerId);
    if (cached) {
      cached.close();
      this.transportCache.delete(providerId);
    }
  }

  invalidateAll() {
    for (const t of this.transportCache.values()) t.close();
    this.transportCache.clear();
  }

  /**
   * Pick the right provider for the given purpose. Returns the DB row (with
   * encrypted password) or an env-fallback snapshot. Never returns null —
   * callers should call `sendMail` which uses this internally.
   */
  async pickProviderFor(purpose: EmailPurpose): Promise<ResolvedProvider | null> {
    // 1) explicit purpose assignment
    const assignment = await this.prisma.smtpPurposeAssignment.findUnique({
      where: { purpose },
      include: { provider: true },
    });
    if (assignment?.provider?.isActive) {
      return this.fromDb(assignment.provider);
    }

    // 2) global default
    const def = await this.prisma.smtpProvider.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (def) return this.fromDb(def);

    // 3) env fallback (dev only)
    if (!this.isProduction) {
      const env = this.fromEnv();
      if (env) return env;
    }

    return null;
  }

  /**
   * Send an email via the resolved provider. On success, returns the
   * SMTP message id. On failure, throws so the caller can log/audit it.
   */
  async sendMail(args: SendMailArgs): Promise<SendMailResult> {
    const provider = await this.pickProviderFor(args.purpose || "AUTH");

    if (!provider) {
      // Final dev fallback — log only and pretend success.
      if (!this.isProduction) {
        this.logger.warn(
          `[DEV EMAIL — NO PROVIDER] purpose=${args.purpose || "AUTH"} to=${args.to} subject="${args.subject}"`,
        );
        return { ok: true, messageId: "dev-noop", providerId: null, mode: "dev" };
      }
      throw new ServiceUnavailableException(
        `No SMTP provider configured for purpose: ${args.purpose || "AUTH"}`,
      );
    }

    const transport = await this.getOrCreateTransport(provider);
    try {
      const info = await transport.sendMail({
        from: `"${provider.fromName}" <${provider.fromAddress}>`,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
        // Pass through caller-supplied attachments (used by the backup
        // success email to deliver the .sql.gz). Optional — existing
        // callers (AUTH / ORDERS / MARKETING) omit this and stay unchanged.
        attachments: args.attachments,
      });
      this.logger.log(
        `[SMTP] sent via ${provider.mode === "db" ? `provider#${provider.id} (${provider.label})` : "env-fallback"} → ${args.to} (messageId=${info.messageId})`,
      );
      return {
        ok: true,
        messageId: info.messageId,
        providerId: provider.id,
        mode: provider.mode,
      };
    } catch (e: any) {
      this.logger.error(
        `[SMTP] send failed via ${provider.label} → ${args.to}: ${e?.message || e}`,
      );
      throw new Error(`SMTP send failed: ${e?.message || "unknown error"}`);
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────

  private fromDb(p: SmtpProvider): ResolvedProvider {
    return {
      id: p.id,
      host: p.host,
      port: p.port,
      user: p.user,
      pass: this.secrets.decrypt({
        ciphertext: p.passCipher,
        iv: p.passIv,
        tag: p.passTag,
      }),
      fromAddress: p.fromAddress,
      fromName: p.fromName,
      encryption: p.encryption,
      rejectUnauthorized: p.rejectUnauthorized,
      label: p.label,
      mode: "db",
    };
  }

  private fromEnv(): ResolvedProvider | null {
    const host = this.config.get<string>("SMTP_DEV_HOST");
    const user = this.config.get<string>("SMTP_DEV_USER");
    const pass = this.config.get<string>("SMTP_DEV_PASS");
    const fromAddress = this.config.get<string>("SMTP_DEV_FROM_ADDRESS");
    if (!host || !user || !pass || !fromAddress) return null;
    return {
      id: null,
      host,
      port: parseInt(this.config.get<string>("SMTP_DEV_PORT") || "587", 10),
      user,
      pass,
      fromAddress,
      fromName: this.config.get<string>("SMTP_DEV_FROM_NAME") || "XovenMart",
      encryption: "STARTTLS",
      rejectUnauthorized: true,
      label: "env-fallback",
      mode: "env",
    };
  }

  private async getOrCreateTransport(p: ResolvedProvider): Promise<Transporter> {
    // Env-fallback providers are not cached (no id, and dev config might change).
    if (!p.id) {
      return createTransport({
        host: p.host,
        port: p.port,
        secure: p.encryption === "TLS",
        auth: { user: p.user, pass: p.pass },
        tls: { rejectUnauthorized: p.rejectUnauthorized },
      });
    }
    let t = this.transportCache.get(p.id);
    if (t) return t;
    t = createTransport({
      host: p.host,
      port: p.port,
      secure: p.encryption === "TLS",
      auth: { user: p.user, pass: p.pass },
      tls: { rejectUnauthorized: p.rejectUnauthorized },
    });
    this.transportCache.set(p.id, t);
    return t;
  }
}
