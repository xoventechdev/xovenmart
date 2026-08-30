import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { PrismaService } from "../../shared/prisma/prisma.module";

/**
 * Public endpoint for the user-facing site (and future Android apps) to
 * fetch the admin-editable delivery marketing text + the list of active
 * delivery zones. Together these let every page say:
 *
 *   "🚚 <promiseLabelBn/En> across <Zone A>, <Zone B>, <Zone C>"
 *
 * without any hardcoded location names or timing strings.
 *
 * No auth — this is safe public data already implied by the order form.
 */
@ApiTags("delivery")
@Controller("delivery")
export class DeliveryPublicController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("public")
  @ApiOperation({
    summary:
      "Public delivery marketing payload: promise text + active zones list.",
  })
  async getPublicDeliveryInfo() {
    const [all, zones] = await Promise.all([
      this.settings.getAll(),
      this.prisma.deliveryZone.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { radiusKm: "asc" }],
      }),
    ]);

    return {
      promise: {
        minutes: all.deliveryPromiseMinutes ?? 30,
        labelBn: all.deliveryPromiseLabelBn ?? "৩০ মিনিটে ডেলিভারি",
        labelEn: all.deliveryPromiseLabelEn ?? "30-min delivery",
      },
      // Admin-editable full marketing line(s). Frontend substitutes the
      // `{zones}` placeholder with the active zone list so the admin
      // can rephrase the prefix (e.g. "Same-day delivery", "1-hour
      // delivery", "দ্রুত ডেলিভারি") without a code deploy.
      marketingLine: {
        bn:
          all.deliveryMarketingLineBn ??
          "{zones} এ সেইম-ডে ডেলিভারি",
        en:
          all.deliveryMarketingLineEn ??
          "Same-day delivery across {zones}",
      },
      // Bilingual brand tagline displayed under the logo / brand name in
      // the site header (and any other place that wants the brand
      // one-liner). Admin-editable so marketing can change copy without a
      // code deploy.
      brandTagline: {
        bn: all.brandTaglineBn ?? "যা চান, যখন চান",
        en: all.brandTaglineEn ?? "Whatever you need, whenever you need it",
      },
      // Whether the user site allows placing orders without logging in.
      // When false, the checkout view bounces unauthenticated users to
      // /login. Default true so unconfigured installs stay permissive.
      guestCheckoutEnabled: all.guestCheckoutEnabled !== false,
      zones: zones.map((z) => ({
        id: z.id,
        nameBn: z.nameBn,
        nameEn: z.nameEn,
      })),
    };
  }
}
