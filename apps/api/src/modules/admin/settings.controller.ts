import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/system")
@Controller("admin/system")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  private async readMap(): Promise<Record<string, any>> {
    const rows = await this.prisma.appSetting.findMany();
    const map: Record<string, any> = {};
    for (const row of rows) {
      try {
        map[row.key] = JSON.parse(row.value);
      } catch {
        map[row.key] = row.value;
      }
    }
    return map;
  }

  private async writeKey(actorId: string | undefined, key: string, value: any) {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        updatedBy: actorId ?? null,
      },
      create: {
        key,
        value: JSON.stringify(value),
        updatedBy: actorId ?? null,
      },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "settings",
          entityId: key,
          action: "update_setting",
          diff: { value },
        },
      });
    }
  }

  // ─── General Settings ─────────────────────────────────────────

  @Get("settings")
  async getAllSettings() {
    return this.readMap();
  }

  @Patch("settings")
  @AdminOnly()
  async updateSettings(@Body() body: { settings: Record<string, any> }, @Req() req: Request) {
    const actorId = (req as any).userId;
    const settings = body?.settings;
    if (!settings || typeof settings !== "object") {
      throw new BadRequestException("settings object is required");
    }
    for (const [key, value] of Object.entries(settings)) {
      if (typeof key !== "string" || key.length === 0) continue;
      await this.writeKey(actorId, key, value);
    }
    return this.readMap();
  }

  // ─── Feature Toggles ─────────────────────────────────────────

  private static readonly TOGGLE_KEYS = {
    enableCOD: "feature.enableCOD",
    enableBkash: "feature.enableBkash",
    enableNagad: "feature.enableNagad",
    enableReferrals: "feature.enableReferrals",
    enableLoyalty: "feature.enableLoyalty",
    enablePushNotifications: "feature.enablePushNotifications",
    maintenanceMode: "feature.maintenanceMode",
    registrationOpen: "feature.registrationOpen",
  };

  @Get("feature-toggles")
  async getFeatureToggles() {
    const map = await this.readMap();
    const bool = (k: string, fallback: boolean) => {
      const v = map[k];
      return typeof v === "boolean" ? v : fallback;
    };
    return {
      enableCOD: bool("feature.enableCOD", true),
      enableBkash: bool("feature.enableBkash", false),
      enableNagad: bool("feature.enableNagad", false),
      enableReferrals: bool("feature.enableReferrals", true),
      enableLoyalty: bool("feature.enableLoyalty", false),
      enablePushNotifications: bool("feature.enablePushNotifications", true),
      maintenanceMode: bool("feature.maintenanceMode", false),
      registrationOpen: bool("feature.registrationOpen", true),
    };
  }

  @Patch("feature-toggles")
  @AdminOnly()
  async updateFeatureToggles(@Body() body: Record<string, any>, @Req() req: Request) {
    const actorId = (req as any).userId;
    const allowed = AdminSettingsController.TOGGLE_KEYS;
    for (const [field, key] of Object.entries(allowed)) {
      if (body && Object.prototype.hasOwnProperty.call(body, field)) {
        await this.writeKey(actorId, key, !!body[field]);
      }
    }
    return this.getFeatureToggles();
  }

  // ─── Auth Settings ────────────────────────────────────────────

  private static readonly AUTH_KEYS = {
    otpRateLimitPerHour: "auth.otpRateLimitPerHour",
    otpLengthMinutes: "auth.otpLengthMinutes",
    maxLoginAttempts: "auth.maxLoginAttempts",
    jwtAccessTtlMin: "auth.jwtAccessTtlMin",
    refreshTtlDays: "auth.refreshTtlDays",
    sessionTimeoutMin: "auth.sessionTimeoutMin",
    requireEmailVerification: "auth.requireEmailVerification",
  };

  @Get("auth-settings")
  async getAuthSettings() {
    const map = await this.readMap();
    const num = (k: string, fallback: number) => {
      const v = map[k];
      return typeof v === "number" ? v : fallback;
    };
    return {
      otpRateLimitPerHour: num("auth.otpRateLimitPerHour", 5),
      otpLengthMinutes: num("auth.otpLengthMinutes", 10),
      maxLoginAttempts: num("auth.maxLoginAttempts", 5),
      jwtAccessTtlMin: num("auth.jwtAccessTtlMin", 60),
      refreshTtlDays: num("auth.refreshTtlDays", 30),
      sessionTimeoutMin: num("auth.sessionTimeoutMin", 60),
      requireEmailVerification:
        typeof map["auth.requireEmailVerification"] === "boolean"
          ? map["auth.requireEmailVerification"]
          : false,
    };
  }

  @Patch("auth-settings")
  @AdminOnly()
  async updateAuthSettings(@Body() body: Record<string, any>, @Req() req: Request) {
    const actorId = (req as any).userId;
    const allowed = AdminSettingsController.AUTH_KEYS;
    for (const [field, key] of Object.entries(allowed)) {
      if (body && Object.prototype.hasOwnProperty.call(body, field)) {
        const v: any = body[field];
        const final = field === "requireEmailVerification" ? !!v : Number(v);
        await this.writeKey(actorId, key, final);
      }
    }
    return this.getAuthSettings();
  }

  // ─── Maintenance ──────────────────────────────────────────────

  @Get("maintenance")
  async getMaintenance() {
    const map = await this.readMap();
    return {
      enabled: !!map["maintenance.enabled"],
      message: map["maintenance.message"] ?? "",
      startsAt: map["maintenance.startsAt"] ?? null,
      endsAt: map["maintenance.endsAt"] ?? null,
      scheduledWindows: Array.isArray(map["maintenance.scheduledWindows"])
        ? map["maintenance.scheduledWindows"]
        : [],
    };
  }

  @Post("maintenance")
  @AdminOnly()
  async updateMaintenance(
    @Body() body: { enabled: boolean; message?: string; startsAt?: string; endsAt?: string },
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    if (typeof body?.enabled !== "boolean") {
      throw new BadRequestException("enabled (boolean) is required");
    }
    await this.writeKey(actorId, "maintenance.enabled", body.enabled);
    if (body.message !== undefined) {
      await this.writeKey(actorId, "maintenance.message", body.message);
    }
    if (body.startsAt !== undefined) {
      await this.writeKey(actorId, "maintenance.startsAt", body.startsAt);
    }
    if (body.endsAt !== undefined) {
      await this.writeKey(actorId, "maintenance.endsAt", body.endsAt);
    }
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "maintenance",
          entityId: "maintenance",
          action: body.enabled ? "enable_maintenance" : "disable_maintenance",
          diff: body,
        },
      });
    }
    return this.getMaintenance();
  }

  // ─── Referral Settings ────────────────────────────────────────
  // Admin-editable knobs for the referral reward. Mirrors the keys the
  // /referrals/me share message / share page mention ("৳50 off") — the
  // coupon code itself still uses REF-XXXXXX prefix.
  //
  // Default values match the previous hardcoded behavior so an
  // unconfigured dev install keeps working without surprise changes.

  private static readonly REFERRAL_KEYS = {
    rewardAmount: "referral.rewardAmount",
    couponTtlDays: "referral.couponTtlDays",
    minOrder: "referral.minOrder",
    enabled: "feature.enableReferrals",
  };

  @Get("referral-settings")
  async getReferralSettings() {
    const map = await this.readMap();
    const num = (k: string, fallback: number) => {
      const v = map[k];
      return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
    };
    return {
      rewardAmount: num("referral.rewardAmount", 50),
      couponTtlDays: num("referral.couponTtlDays", 60),
      minOrder: num("referral.minOrder", 0),
      enabled:
        typeof map["feature.enableReferrals"] === "boolean"
          ? map["feature.enableReferrals"]
          : true,
    };
  }

  @Patch("referral-settings")
  @AdminOnly()
  async updateReferralSettings(
    @Body() body: Record<string, any>,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId;
    const allowed = AdminSettingsController.REFERRAL_KEYS;
    for (const [field, key] of Object.entries(allowed)) {
      if (!body || !Object.prototype.hasOwnProperty.call(body, field)) continue;
      let v: any = body[field];
      if (field === "enabled") {
        // Mirrors the feature-toggle endpoint: store under the same
        // canonical key, so the public toggle + this card stay in sync.
        await this.writeKey(actorId, key, !!v);
        continue;
      }
      // Numeric fields: clamp to >= 0 and round to integers for the
      // amount / days. The min order may be 0.
      const n = Math.max(0, Math.floor(Number(v)));
      if (Number.isNaN(n)) {
        throw new BadRequestException(`${field} must be a number`);
      }
      await this.writeKey(actorId, key, n);
    }
    return this.getReferralSettings();
  }

  // ─── Health ───────────────────────────────────────────────────

  @Get("health")
  async health() {
    const start = Date.now();
    let db: "ok" | "error" = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "error";
    }
    const dbLatencyMs = Date.now() - start;
    return {
      db,
      dbLatencyMs,
      uptimeSec: Math.floor(process.uptime()),
      nodeVersion: process.version,
      now: new Date().toISOString(),
    };
  }
}
