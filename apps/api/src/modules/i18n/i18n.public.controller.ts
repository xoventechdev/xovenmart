import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../shared/prisma/prisma.module";

type Locale = "bn" | "en";

@ApiTags("i18n")
@Controller("i18n")
export class I18nPublicController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /i18n/:locale
   * Returns the full translation bundle for a locale as a flat key→value map.
   * Used by web/admin/Android apps to hydrate their translation cache on
   * launch. Unguarded — anyone can fetch translations.
   */
  @Get(":locale")
  @ApiOperation({ summary: "Get all translations for a locale (public)" })
  async getBundle(@Param("locale") locale: string) {
    if (locale !== "bn" && locale !== "en") {
      throw new BadRequestException(`Unsupported locale: ${locale}. Supported: bn, en`);
    }
    const rows = await this.prisma.translation.findMany({
      where: { locale },
      select: { key: true, value: true },
    });
    const translations: Record<string, string> = {};
    for (const r of rows) translations[r.key] = r.value;
    return { locale, translations, count: rows.length };
  }

  /**
   * GET /i18n/:locale/missing
   * Returns keys that exist in the OTHER locale but are missing from `:locale`.
   * Used by the admin /admin/translations page to highlight coverage gaps.
   */
  @Get(":locale/missing")
  @ApiOperation({ summary: "Keys present in other locale but missing here" })
  async getMissingKeys(@Param("locale") locale: string) {
    if (locale !== "bn" && locale !== "en") {
      throw new BadRequestException(`Unsupported locale: ${locale}`);
    }
    // All distinct keys across both locales
    const allKeysRows = await this.prisma.translation.findMany({
      select: { key: true },
      distinct: ["key"],
    });
    const have = new Set(
      (
        await this.prisma.translation.findMany({
          where: { locale },
          select: { key: true },
        })
      ).map((r) => r.key),
    );
    const missing = allKeysRows.map((r) => r.key).filter((k) => !have.has(k));
    return { locale, missing, count: missing.length };
  }
}