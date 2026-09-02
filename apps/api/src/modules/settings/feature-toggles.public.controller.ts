import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * Public (no-auth) read of the admin's feature-toggle flags. The same 8
 * toggles the admin edits at `/admin/system/feature-toggles`, exposed to
 * the user-facing web so the public site can:
 *
 *   - disable bKash / Nagad payment options at checkout until the admin
 *     enables them (no more hardcoded `enabled={false}` placeholders),
 *   - show a "Registration closed" banner on `/register` when the admin
 *     turns off `registrationOpen`,
 *   - gate the whole public site behind a maintenance banner when
 *     `maintenanceMode` is on,
 *   - hide push-notification opt-in UI when `enablePushNotifications`
 *     is off (handled by future push-notification module).
 *
 * Defaults match `admin/settings.controller.ts` so an unconfigured dev
 * install keeps the previous behavior (COD + registration + maintenance
 * off). The toggle read is intentionally cheap — single `findMany` on
 * AppSetting — and cached for 60 s by the front-end React Query layer.
 */
@ApiTags("system")
@Controller("public/feature-toggles")
export class FeatureTogglesPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary:
      "Public read of the 8 admin-editable feature toggles. No auth required.",
  })
  async getFeatureToggles() {
    const rows = await this.prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            "feature.enableCOD",
            "feature.enableBkash",
            "feature.enableNagad",
            "feature.enableReferrals",
            "feature.enableLoyalty",
            "feature.enablePushNotifications",
            "feature.maintenanceMode",
            "feature.registrationOpen",
          ],
        },
      },
    });
    const map: Record<string, any> = {};
    for (const row of rows) {
      try {
        map[row.key] = JSON.parse(row.value);
      } catch {
        map[row.key] = row.value;
      }
    }
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
}