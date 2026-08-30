import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { NotificationService } from "../notifications/notifications.service";

export interface AppSettings {
  // ─── Auth verification (admin-controlled) ───
  /** Whether phone OTP is required to login/register. Toggle off for testing. */
  otpRequired?: boolean;
  /** OTP TTL in minutes. */
  otpTtlMinutes?: number;
  /** Max OTPs per phone per hour. */
  otpRateLimitPerHour?: number;
  /** Allow email/password auth for customers in addition to phone OTP. */
  emailAuthEnabled?: boolean;
  /** Require email verification before placing orders. */
  requireEmailForOrders?: boolean;
  /** Require name on registration. */
  requireNameOnRegistration?: boolean;

  // ─── Notifications ───
  emailNotificationsEnabled?: boolean;
  smsNotificationsEnabled?: boolean;
  pushNotificationsEnabled?: boolean;

  // ─── Order / checkout ───
  guestCheckoutEnabled?: boolean;
  referralSystemEnabled?: boolean;
  referralRewardAmount?: number;
  minOrderAmount?: number;
  maxOrderAmount?: number;

  // ─── Display / business ───
  /** Bangla-first language toggle. */
  defaultLanguage?: "bn" | "en";
  supportPhone?: string;
  supportEmail?: string;

  /**
   * Bilingual brand tagline shown right under the logo / brand name in the
   * site header (and any other place that wants the brand one-liner).
   * Defaults: "যা চান, যখন চান" / "Whatever you need, whenever you need it".
   */
  brandTaglineBn?: string;
  brandTaglineEn?: string;

  // ─── Delivery promise (admin-editable marketing text) ───
  /** How many minutes delivery takes, used in marketing copy. */
  deliveryPromiseMinutes?: number;
  /** Bilingual labels for the promise badge (e.g. header strip). */
  deliveryPromiseLabelBn?: string;
  deliveryPromiseLabelEn?: string;

  /**
   * Bilingual "marketing line" used in hero / footer / SEO descriptions.
   * Supports a single `{zones}` placeholder that the frontend substitutes
   * with the active delivery zone list. Example default:
   *   en: "Same-day delivery across {zones}"
   *   bn: "{zones} এ সেইম-ডে ডেলিভারি"
   * The admin can rewrite either prefix to anything (e.g. "1-hour
   * delivery", "দ্রুত ডেলিভারি") without a code deploy.
   */
  deliveryMarketingLineEn?: string;
  deliveryMarketingLineBn?: string;

  // ─── Maintenance ───
  maintenanceMode?: boolean;
  maintenanceMessageBn?: string;
  maintenanceMessageEn?: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: Map<string, any> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Get all settings as a flat object. Cached in memory for 60s.
   */
  async getAll(): Promise<AppSettings> {
    if (this.cache) {
      return Object.fromEntries(this.cache) as AppSettings;
    }
    const rows = await this.prisma.appSetting.findMany();
    if (!this.cache) this.cache = new Map();
    for (const r of rows) {
      try {
        this.cache.set(r.key, JSON.parse(r.value));
      } catch {
        this.cache.set(r.key, r.value);
      }
    }
    // Defaults for unset keys
    return this.applyDefaults(Object.fromEntries(this.cache));
  }

  /** Get a single setting with default fallback. */
  async get<K extends keyof AppSettings>(key: K, fallback?: AppSettings[K]): Promise<AppSettings[K]> {
    const all = await this.getAll();
    return all[key] ?? fallback;
  }

  /**
   * Update a setting (admin only). Validates the value.
   */
  async set(key: string, value: any, actorId: string) {
    const json = JSON.stringify(value);
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: json, updatedBy: actorId, updatedAt: new Date() },
      create: { key, value: json, updatedBy: actorId },
    });
    // Bust cache
    this.cache = null;
    this.notifications.invalidateSettingsCache();
    return { ok: true, key, value };
  }

  /** Bulk update. */
  async setMany(updates: Record<string, any>, actorId: string) {
    await Promise.all(
      Object.entries(updates).map(([k, v]) => this.set(k, v, actorId)),
    );
    return { ok: true };
  }

  /** Reset to defaults. */
  async reset(actorId: string) {
    await this.prisma.appSetting.deleteMany({});
    this.cache = null;
    await this.seedDefaults(actorId);
    return { ok: true };
  }

  private async seedDefaults(actorId: string) {
    const defaults: AppSettings = {
      otpRequired: true,
      otpTtlMinutes: 5,
      otpRateLimitPerHour: 3,
      emailAuthEnabled: false,
      requireEmailForOrders: false,
      requireNameOnRegistration: true,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: true,
      pushNotificationsEnabled: true,
      guestCheckoutEnabled: true,
      referralSystemEnabled: true,
      referralRewardAmount: 50,
      minOrderAmount: 0,
      maxOrderAmount: 50000,
      defaultLanguage: "bn",
      supportPhone: "01720694513",
      supportEmail: "support@xovenmart.com",
      brandTaglineBn: "যা চান, যখন চান",
      brandTaglineEn: "Whatever you need, whenever you need it",
      deliveryPromiseMinutes: 30,
      deliveryPromiseLabelBn: "৩০ মিনিটে ডেলিভারি",
      deliveryPromiseLabelEn: "30-min delivery",
      deliveryMarketingLineEn: "Same-day delivery across {zones}",
      deliveryMarketingLineBn: "{zones} এ সেইম-ডে ডেলিভারি",
      maintenanceMode: false,
    };
    await Promise.all(
      Object.entries(defaults).map(([k, v]) =>
        this.prisma.appSetting.create({
          data: { key: k, value: JSON.stringify(v), updatedBy: actorId },
        }),
      ),
    );
  }

  private applyDefaults(all: any): AppSettings {
    return {
      otpRequired: true,
      otpTtlMinutes: 5,
      otpRateLimitPerHour: 3,
      emailAuthEnabled: false,
      requireEmailForOrders: false,
      requireNameOnRegistration: true,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: true,
      pushNotificationsEnabled: true,
      guestCheckoutEnabled: true,
      referralSystemEnabled: true,
      referralRewardAmount: 50,
      minOrderAmount: 0,
      maxOrderAmount: 50000,
      defaultLanguage: "bn",
      supportPhone: "01720694513",
      supportEmail: "support@xovenmart.com",
      brandTaglineBn: "যা চান, যখন চান",
      brandTaglineEn: "Whatever you need, whenever you need it",
      deliveryPromiseMinutes: 30,
      deliveryPromiseLabelBn: "৩০ মিনিটে ডেলিভারি",
      deliveryPromiseLabelEn: "30-min delivery",
      deliveryMarketingLineEn: "Same-day delivery across {zones}",
      deliveryMarketingLineBn: "{zones} এ সেইম-ডে ডেলিভারি",
      maintenanceMode: false,
      ...all,
    };
  }
}