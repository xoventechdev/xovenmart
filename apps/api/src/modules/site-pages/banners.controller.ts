import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Audience, AuthGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("banners")
@Controller("banners")
export class BannersPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("public")
  @ApiOperation({ summary: "Active banners for a position. ?position=homepage_hero (default)" })
  async list(@Query("position") position?: string) {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        position: position || "homepage_hero",
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
    });
  }
}

@ApiTags("admin/banners")
@Controller("admin/banners")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class BannersAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query("position") position?: string) {
    return this.prisma.banner.findMany({
      where: position ? { position } : {},
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  @Post()
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    return this.prisma.banner.create({
      data: {
        imageUrl: body.imageUrl,
        mobileImageUrl: body.mobileImageUrl,
        linkUrl: body.linkUrl,
        titleBn: body.titleBn,
        titleEn: body.titleEn,
        subtitleBn: body.subtitleBn,
        subtitleEn: body.subtitleEn,
        position: body.position || "homepage_hero",
        isActive: body.isActive ?? true,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        sortOrder: body.sortOrder ?? 0,
        updatedBy: actorId,
      },
    });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    return this.prisma.banner.update({
      where: { id },
      data: {
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.mobileImageUrl !== undefined && { mobileImageUrl: body.mobileImageUrl }),
        ...(body.linkUrl !== undefined && { linkUrl: body.linkUrl }),
        ...(body.titleBn !== undefined && { titleBn: body.titleBn }),
        ...(body.titleEn !== undefined && { titleEn: body.titleEn }),
        ...(body.subtitleBn !== undefined && { subtitleBn: body.subtitleBn }),
        ...(body.subtitleEn !== undefined && { subtitleEn: body.subtitleEn }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.startsAt !== undefined && { startsAt: body.startsAt ? new Date(body.startsAt) : null }),
        ...(body.endsAt !== undefined && { endsAt: body.endsAt ? new Date(body.endsAt) : null }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        updatedBy: actorId,
      },
    });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.prisma.banner.delete({ where: { id } });
    return { ok: true };
  }
}
