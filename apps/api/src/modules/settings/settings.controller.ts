import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { SettingsService } from "./settings.service";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";

@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ─── Public read of safe settings ───

  @Get("public")
  @ApiOperation({ summary: "Public-safe settings (for app/web to read). No secrets." })
  async publicSettings() {
    const all = await this.settings.getAll();
    return {
      guestCheckoutEnabled: all.guestCheckoutEnabled,
      referralSystemEnabled: all.referralSystemEnabled,
      defaultLanguage: all.defaultLanguage,
      requireEmailForOrders: all.requireEmailForOrders,
      requireNameOnRegistration: all.requireNameOnRegistration,
      otpRequired: all.otpRequired,
      emailAuthEnabled: all.emailAuthEnabled,
      supportPhone: all.supportPhone,
      supportEmail: all.supportEmail,
      minOrderAmount: all.minOrderAmount,
      maxOrderAmount: all.maxOrderAmount,
      // Maintenance state has moved out of the legacy settings bundle
      // entirely. The public site now reads `/public/maintenance` via
      // `MaintenancePublicController`; admins edit it from
      // `/admin/system/maintenance`. No replacement fields here — the
      // lock either is or isn't on.
      deliveryPromiseMinutes: all.deliveryPromiseMinutes,
      deliveryPromiseLabelBn: all.deliveryPromiseLabelBn,
      deliveryPromiseLabelEn: all.deliveryPromiseLabelEn,
      deliveryMarketingLineBn: all.deliveryMarketingLineBn,
      deliveryMarketingLineEn: all.deliveryMarketingLineEn,
      brandTaglineBn: all.brandTaglineBn,
      brandTaglineEn: all.brandTaglineEn,
    };
  }

  // ─── Admin manage ───

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Audience("admin" as any)
  @ApiBearerAuth("Admin")
  @ApiOperation({ summary: "Get all settings (admin only)" })
  all() {
    return this.settings.getAll();
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Audience("admin" as any)
  @ApiBearerAuth("Admin")
  @ApiOperation({ summary: "Update settings (admin only). Pass a flat key→value object." })
  update(@Req() req: Request, @Body() updates: Record<string, any>) {
    const actorId = (req as any).userId;
    return this.settings.setMany(updates, actorId);
  }

  @Post("reset")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Audience("admin" as any)
  @ApiBearerAuth("Admin")
  @ApiOperation({ summary: "Reset all settings to defaults" })
  reset(@Req() req: Request) {
    const actorId = (req as any).userId;
    return this.settings.reset(actorId);
  }
}