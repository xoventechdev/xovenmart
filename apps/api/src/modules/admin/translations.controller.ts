import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { Locale } from "@prisma/client";

@ApiTags("admin/translations")
@Controller("admin/translations")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminTranslationsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /admin/translations?locale=bn&q=checkout&page=1
   * List translations for the given locale, with optional key search.
   * Caps at 200 per page — fine for any realistic translation set.
   */
  @Get()
  @ApiOperation({ summary: "List translations for a locale (admin)" })
  async list(@Query() q: { locale?: string; q?: string; page?: number }) {
    const locale = this.parseLocale(q.locale ?? "bn");
    const page = Math.max(1, Number(q.page ?? 1));
    const perPage = 200;
    const where: any = { locale };
    if (q.q?.trim()) {
      where.key = { contains: q.q.trim(), mode: "insensitive" as const };
    }
    const [items, total] = await Promise.all([
      this.prisma.translation.findMany({
        where,
        orderBy: { key: "asc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.translation.count({ where }),
    ]);
    return { items, total, page, perPage, locale };
  }

  /**
   * GET /admin/translations/coverage?locale=bn
   * Returns coverage stats: how many keys defined per locale.
   */
  @Get("coverage")
  @ApiOperation({ summary: "Coverage stats — total keys per locale + missing counts" })
  async coverage() {
    const [bnCount, enCount, allKeys] = await Promise.all([
      this.prisma.translation.count({ where: { locale: "bn" } }),
      this.prisma.translation.count({ where: { locale: "en" } }),
      this.prisma.translation.findMany({
        select: { key: true, locale: true },
        distinct: ["key"],
      }),
    ]);
    const totalDistinctKeys = new Set(allKeys.map((r) => r.key)).size;
    const bnHas = new Set(
      (await this.prisma.translation.findMany({ where: { locale: "bn" }, select: { key: true } })).map(
        (r) => r.key,
      ),
    );
    const enHas = new Set(
      (await this.prisma.translation.findMany({ where: { locale: "en" }, select: { key: true } })).map(
        (r) => r.key,
      ),
    );
    const allDistinctKeys = Array.from(new Set(allKeys.map((r) => r.key)));
    return {
      totalDistinctKeys,
      bnCount,
      enCount,
      bnMissingInLocale: allDistinctKeys.filter((k) => !bnHas.has(k)).length,
      enMissingInLocale: allDistinctKeys.filter((k) => !enHas.has(k)).length,
    };
  }

  /**
   * PUT /admin/translations
   * Upsert one row. Body: { key, locale, value }
   * Audit-logs every write with the actor id + before/after.
   */
  @Put()
  @AdminOnly()
  @ApiOperation({ summary: "Upsert a translation. ADMIN only." })
  async upsert(
    @Body() body: { key: string; locale: string; value: string },
    @Req() req: Request,
  ) {
    const locale = this.parseLocale(body.locale);
    const key = String(body.key ?? "").trim();
    if (!key) throw new BadRequestException("key is required");
    if (body.value == null) throw new BadRequestException("value is required");
    const value = String(body.value);

    const actorId = (req as any).userId;
    const before = await this.prisma.translation.findUnique({
      where: { key_locale: { key, locale } },
    });
    const row = await this.prisma.translation.upsert({
      where: { key_locale: { key, locale } },
      create: { key, locale, value, updatedBy: actorId },
      update: { value, updatedBy: actorId },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "translation",
        entityId: `${key}:${locale}`,
        action: before ? "update" : "create",
        diff: { before: before?.value ?? null, after: value, key, locale },
      },
    });
    return row;
  }

  /**
   * POST /admin/translations/bulk
   * Bulk upsert. Body: { rows: [{key, locale, value}, ...] }
   * Useful when pasting a large JSON file.
   */
  @Post("bulk")
  @AdminOnly()
  @ApiOperation({ summary: "Bulk upsert translations. ADMIN only." })
  async bulkUpsert(
    @Body() body: { rows: Array<{ key: string; locale: string; value: string }> },
    @Req() req: Request,
  ) {
    if (!Array.isArray(body.rows)) throw new BadRequestException("rows[] is required");
    const actorId = (req as any).userId;
    let updated = 0;
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < body.rows.length; i++) {
      const r = body.rows[i];
      try {
        const locale = this.parseLocale(r.locale);
        const key = String(r.key ?? "").trim();
        if (!key || r.value == null) throw new Error("missing key or value");
        await this.prisma.translation.upsert({
          where: { key_locale: { key, locale } },
          create: { key, locale, value: String(r.value), updatedBy: actorId },
          update: { value: String(r.value), updatedBy: actorId },
        });
        updated++;
      } catch (e: any) {
        errors.push({ index: i, error: e?.message ?? "unknown" });
      }
    }
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "translation",
        entityId: "bulk",
        action: "bulk_upsert",
        diff: { requested: body.rows.length, updated, errors: errors.length },
      },
    });
    return { ok: true, requested: body.rows.length, updated, errors };
  }

  /**
   * DELETE /admin/translations/:key/:locale
   * ADMIN only. Removes one (key, locale) row.
   */
  @Delete(":key/:locale")
  @AdminOnly()
  @ApiOperation({ summary: "Delete one translation. ADMIN only." })
  async remove(
    @Param("key") key: string,
    @Param("locale") localeParam: string,
    @Req() req: Request,
  ) {
    const locale = this.parseLocale(localeParam);
    const existing = await this.prisma.translation.findUnique({
      where: { key_locale: { key, locale } },
    });
    if (!existing) throw new NotFoundException(`Translation ${key}:${locale} not found`);
    await this.prisma.translation.delete({ where: { key_locale: { key, locale } } });
    await this.prisma.auditLog.create({
      data: {
        actorId: (req as any).userId,
        actorRole: "ADMIN",
        entity: "translation",
        entityId: `${key}:${locale}`,
        action: "delete",
        diff: { value: existing.value },
      },
    });
    return { ok: true };
  }

  /**
   * GET /admin/translations/export?locale=bn
   * Returns the full bundle as a flat key→value JSON object. The admin UI
   * uses this to give the user a downloadable file.
   */
  @Get("export")
  @ApiOperation({ summary: "Export full bundle for a locale as JSON" })
  async exportBundle(@Query("locale") localeParam: string) {
    const locale = this.parseLocale(localeParam ?? "bn");
    const rows = await this.prisma.translation.findMany({
      where: { locale },
      select: { key: true, value: true, updatedAt: true },
      orderBy: { key: "asc" },
    });
    const translations: Record<string, string> = {};
    for (const r of rows) translations[r.key] = r.value;
    return { locale, translations, count: rows.length, exportedAt: new Date().toISOString() };
  }

  /**
   * POST /admin/translations/import
   * Body: { locale: "bn" | "en", rows: [{ key, value }, ...] }
   * Idempotent — safe to re-import.
   */
  @Post("import")
  @AdminOnly()
  @ApiOperation({ summary: "Import a bundle (flat key→value). ADMIN only." })
  async importBundle(
    @Body() body: { locale: string; rows: Array<{ key: string; value: string }> },
    @Req() req: Request,
  ) {
    const locale = this.parseLocale(body.locale ?? "bn");
    if (!Array.isArray(body.rows)) throw new BadRequestException("rows[] is required");
    const actorId = (req as any).userId;
    let updated = 0;
    for (const r of body.rows) {
      const key = String(r.key ?? "").trim();
      if (!key || r.value == null) continue;
      await this.prisma.translation.upsert({
        where: { key_locale: { key, locale } },
        create: { key, locale, value: String(r.value), updatedBy: actorId },
        update: { value: String(r.value), updatedBy: actorId },
      });
      updated++;
    }
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "translation",
        entityId: `import:${locale}`,
        action: "import",
        diff: { requested: body.rows.length, updated },
      },
    });
    return { ok: true, locale, updated };
  }

  private parseLocale(s: string): Locale {
    if (s === "bn" || s === "en") return s;
    throw new BadRequestException(`Unsupported locale: ${s}. Supported: bn, en`);
  }
}