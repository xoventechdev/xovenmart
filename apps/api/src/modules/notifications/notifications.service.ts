import { Injectable, Logger } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SmsService } from "../../shared/sms/sms.service";

/**
 * Notifications module — multi-channel delivery for order updates.
 *
 * Channels:
 *  - SMS    (always, if phone available)
 *  - Email  (always, if user.email available AND emailOrderUpdates setting is on)
 *  - Push   (FCM, if fcmToken registered)
 *
 * User can opt-out per-channel via NotificationPreference.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Send status-change notifications for an order.
   * Called by OrdersService on every status update.
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

    const subject = `XovenMart — Order ${order.orderNo} — ${newStatus}`;
    const bodyText =
      `Your order ${order.orderNo} status: ${newStatus}\n` +
      `Track: https://xovenmart.com/orders/${order.orderNo}`;

    // ─── SMS ───
    if (prefs.sms && contactPhone) {
      try {
        await this.sms.sendOrderStatusUpdate(contactPhone, order.orderNo, statusBn);
      } catch (e) {
        this.logger.warn(`SMS notification failed: ${(e as Error).message}`);
      }
    }

    // ─── Email ───
    if (prefs.email && allowEmail && contactEmail) {
      try {
        await this.sendEmail({
          to: contactEmail,
          subject,
          text: bodyText,
        });
      } catch (e) {
        this.logger.warn(`Email notification failed: ${(e as Error).message}`);
      }
    }

    // ─── Push (FCM) — stub for now; will use @google-cloud/firebase-messaging ───
    if (prefs.push && order.user?.fcmToken) {
      try {
        await this.sendFcm(order.user.fcmToken, {
          title: `Order ${order.orderNo}`,
          body: statusBn,
          data: { orderId: order.id, orderNo: order.orderNo, status: newStatus },
        });
      } catch (e) {
        this.logger.warn(`FCM send failed: ${(e as Error).message}`);
      }
    }
  }

  // ─── Generic email + FCM helpers ───────────────────────────────

  private async sendEmail(args: { to: string; subject: string; text: string }) {
    // Day 1: minimal — uses Resend / Brevo API.
    // For now: log only if no API key configured.
    const apiKey = process.env.BREVO_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.log(`[DEV EMAIL] To: ${args.to} | Subject: ${args.subject} | ${args.text}`);
      return { ok: true, mode: "dev" };
    }
    // Production implementation will go here.
    // await fetch("https://api.brevo.com/v3/smtp/email", { ... });
    return { ok: true, mode: "stub" };
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
    for (const r of rows) this.cache.set(r.key, r.value);
    return Object.fromEntries(this.cache ?? new Map());
  }

  /** Call after admin updates settings. */
  invalidateSettingsCache() {
    this.cache = null;
  }
}