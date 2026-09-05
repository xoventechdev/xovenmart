import { Injectable, Logger } from "@nestjs/common";
import { EmailPurpose, OrderStatus } from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SmsService } from "../../shared/sms/sms.service";
import { SmtpService } from "./smtp.service";
import { TemplatesService } from "../templates/templates.service";

/**
 * Notifications module — multi-channel delivery for order updates.
 *
 * Channels:
 *  - SMS    (always, if phone available)
 *  - Email  (always, if user.email available AND emailOrderUpdates setting is on)
 *  - Push   (FCM, if fcmToken registered; stub for now)
 *
 * User can opt-out per-channel via NotificationPreference.
 *
 * Subject + body for every channel are now sourced from `TemplatesService`
 * (which reads the bilingual `template.<channel>.<name>` rows in
 * `AppSetting`). The hardcoded literal fallbacks live inside the service
 * so removing a row never crashes the send path.
 *
 * Locale is resolved per-recipient: registered user's `defaultLanguage`,
 * else site-wide `defaultLanguage` app setting (default `bn`).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly smtp: SmtpService,
    private readonly templates: TemplatesService,
  ) {}

  /**
   * Send status-change notifications for an order.
   * Called by OrdersService on every status update.
   *
   * Per-status template key mapping keeps the email copy specific to each
   * state instead of a single generic "Order X — STATUS" subject.
   */
  async notifyOrderStatusChange(orderId: string, newStatus: OrderStatus, statusBn: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });
    if (!order) return;

    const contactPhone = order.user?.phone || order.guestPhone;
    const contactEmail = order.user?.email;
    const userId = order.userId;

    // Per-user preferences (if logged in)
    let prefs: { sms: boolean; email: boolean; push: boolean } = { sms: true, email: true, push: true };
    if (userId) {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId },
      });
      if (pref) {
        prefs = {
          sms: pref.smsOrderUpdates,
          email: pref.emailOrderUpdates,
          push: pref.pushOrderUpdates,
        };
      }
    }

    // App settings (admin toggle)
    const appSettings = await this.getAppSettings();
    const allowEmail = appSettings.emailNotificationsEnabled !== false;

    const locale = await this.templates.resolveLocale(userId);
    const templateKey = this.pickTemplateKeyForStatus(newStatus);
    const customerName = order.user?.name || order.guestName || "Customer";
    const itemCount = Array.isArray((order as any).items)
      ? (order as any).items.length
      : undefined;
    const vars: Record<string, unknown> = {
      orderNo: order.orderNo,
      customerName,
      status: newStatus,
      statusBn,
      url: `${process.env.PUBLIC_WEB_URL ?? "https://xovenmart.com"}/orders/${order.orderNo}`,
    };
    if (itemCount !== undefined) vars.itemCount = itemCount;
    // Best-effort snapshot fields if available on the order.
    if ((order as any).subtotal != null) vars.subtotal = (order as any).subtotal;
    if ((order as any).deliveryFee != null) vars.deliveryFee = (order as any).deliveryFee;
    if ((order as any).total != null) vars.total = (order as any).total;
    if ((order as any).paymentMethod) vars.paymentMethod = (order as any).paymentMethod;
    if ((order as any).addressText) vars.address = (order as any).addressText;

    // ─── SMS ───
    if (prefs.sms && contactPhone) {
      try {
        const smsRendered = await this.templates.renderSms("order_status", vars, locale);
        await this.sms.send(contactPhone, smsRendered.body);
      } catch (e) {
        this.logger.warn(`SMS notification failed: ${(e as Error).message}`);
      }
    }

    // ─── Email ───
    if (prefs.email && allowEmail && contactEmail) {
      try {
        const rendered = await this.templates.renderEmail("email", templateKey, vars, locale);
        await this.sendEmailForTemplate({
          to: contactEmail,
          subject: rendered.subject || `Order ${order.orderNo}`,
          text: rendered.body,
          html: rendered.html,
          purpose: rendered.emailPurpose ?? "ORDERS",
        });
      } catch (e) {
        this.logger.warn(`Email notification failed: ${(e as Error).message}`);
      }
    }

    // ─── Push (FCM) — stub for now; will use @google-cloud/firebase-messaging ───
    if (prefs.push && order.user?.fcmToken) {
      try {
        const pushRendered = await this.templates.renderPush(
          "order_status",
          vars,
          locale,
        );
        await this.sendFcm(order.user.fcmToken, {
          title: `Order ${order.orderNo}`,
          body: pushRendered.body,
          data: { orderId: order.id, orderNo: order.orderNo, status: newStatus },
        });
      } catch (e) {
        this.logger.warn(`FCM send failed: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Map an OrderStatus enum to the matching email template key.
   * The OrderStatus enum starts with PENDING (not PLACED) — see
   * `packages/db/prisma/schema.prisma`.
   */
  private pickTemplateKeyForStatus(status: OrderStatus): string {
    switch (status) {
      case "PENDING":
      case "ACCEPTED":
        return "order_accepted";
      case "PREPARING":
        return "order_preparing";
      case "PREPARED":
        return "order_prepared";
      case "OUT_FOR_DELIVERY":
        return "order_out_for_delivery";
      case "DELIVERED":
        return "order_delivered";
      case "CANCELLED":
        return "order_cancelled";
      case "RETURNED":
        return "order_returned";
      case "REFUNDED":
        return "order_refunded";
      default:
        return "order_placed";
    }
  }

  /**
   * Send a one-time code to a customer's email address. Uses the AUTH
   * EmailPurpose so the OTP lands on the SMTP provider the admin assigned
   * to authentication (Brevo / SES / etc.) — NOT the marketing or backups
   * bucket. Dev mode (no SMTP provider) ends up as a `logger.warn` via
   * SmtpService, which is fine for local testing.
   */
  async sendOtpEmail(email: string, code: string, opts?: { minutes?: number; purpose?: string }) {
    const minutes = opts?.minutes ?? 5;
    const purpose = opts?.purpose ?? "verification";
    // OTP is sent to whichever locale the admin's UI defaults to — recipient
    // locale doesn't apply here because there's no user yet at register time.
    const locale = "bn";
    const vars: Record<string, unknown> = { code, minutes, purpose };
    const rendered = await this.templates.renderEmail("email", "otp", vars, locale);
    await this.sendEmailForTemplate({
      to: email,
      subject: rendered.subject || "Your XovenMart verification code",
      text: rendered.body,
      html: rendered.html,
      purpose: rendered.emailPurpose ?? "AUTH",
    });
  }

  // ─── Generic email + FCM helpers ───────────────────────────────

  /**
   * Send an email via the SMTP module using the row's `emailPurpose`
   * (so `pickProviderFor(purpose)` picks the correct SMTP provider).
   * Returns the underlying SmtpService result for callers that want to
   * inspect providerUsed (e.g. test-send audit).
   *
   * NOTE: this is the public send path used by `notifyOrderStatusChange`,
   * `sendOtpEmail`, `notifyAdminEmailChanged`, and the admin test-send
   * endpoint. `purpose` is REQUIRED — callers must declare which SMTP
   * routing bucket the message belongs to.
   */
  async sendEmailForTemplate(args: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    purpose: EmailPurpose;
  }) {
    return this.smtp.sendMail({
      purpose: args.purpose,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
  }

  /**
   * Backwards-compatible alias for legacy callers. `purpose` defaults to
   * AUTH for OTP / password-reset flows that don't yet pass a purpose.
   * New callers should prefer `sendEmailForTemplate` with an explicit purpose.
   */
  private async sendEmail(args: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    purpose?: EmailPurpose;
  }) {
    return this.sendEmailForTemplate({
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      purpose: args.purpose ?? "AUTH",
    });
  }

  /**
   * Send a security alert to BOTH the old and new inboxes of an admin
   * whose email was just changed. The point is anti-hijack: a real user
   * notices the alert in either inbox, while a hijacker would need to
   * control BOTH addresses to suppress both signals.
   *
   * Admin alerts are always English (admins use the admin UI which is
   * primarily English-facing).
   */
  async notifyAdminEmailChanged(adminUserId: string, oldEmail: string, newEmail: string) {
    const locale = "en";
    const vars: Record<string, unknown> = {
      oldEmail,
      newEmail,
      when: new Date().toISOString(),
      ip: "admin-ui",
      supportPhone: (await this.getAppSettings()).supportPhone ?? "01720694513",
    };
    const rendered = await this.templates.renderEmail(
      "email",
      "admin_email_changed",
      vars,
      locale,
    );
    for (const to of [oldEmail, newEmail]) {
      try {
        await this.sendEmailForTemplate({
          to,
          subject: rendered.subject || "Your admin email was updated",
          text: rendered.body,
          html: rendered.html,
          purpose: rendered.emailPurpose ?? "AUTH",
        });
      } catch (e) {
        this.logger.warn(`Email change alert failed for ${to}: ${(e as Error).message}`);
      }
    }
    this.logger.log(
      `[admin-security] email changed for adminUserId=${adminUserId} (${oldEmail} → ${newEmail})`,
    );
  }

  private async sendFcm(token: string, payload: { title: string; body: string; data: Record<string, string> }) {
    // Implementation deferred to Phase 4 — when we have real FCM project set up.
    this.logger.debug(`[FCM stub] Token: ${token.slice(0, 10)}... Payload: ${JSON.stringify(payload)}`);
    return { ok: true, mode: "stub" };
  }

  // ─── App settings cache ────────────────────────────────────────

  private cache: Map<string, any> | null = null;

  private async getAppSettings(): Promise<Record<string, any>> {
    if (this.cache) return Object.fromEntries(this.cache);
    const rows = await this.prisma.appSetting.findMany();
    if (!this.cache) this.cache = new Map();
    for (const r of rows) {
      try {
        this.cache.set(r.key, JSON.parse(r.value));
      } catch {
        this.cache.set(r.key, r.value);
      }
    }
    return Object.fromEntries(this.cache ?? new Map());
  }

  /** Call after admin updates settings. */
  invalidateSettingsCache() {
    this.cache = null;
  }
}
