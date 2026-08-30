import {
  Body,
  ConflictException,
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
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("site-pages")
@Controller("site-pages")
export class SitePagesPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("public")
  @ApiOperation({ summary: "List published pages (public). Optional ?slug=foo to get one." })
  async list(@Query("slug") slug?: string) {
    if (slug) {
      const p = await this.prisma.sitePage.findUnique({ where: { slug } });
      if (!p || !p.isPublished) return null;
      return p;
    }
    return this.prisma.sitePage.findMany({
      where: { isPublished: true },
      select: {
        slug: true, titleBn: true, titleEn: true, showInFooter: true, order: true,
        seoTitle: true, seoDescription: true,
      },
      orderBy: { order: "asc" },
    });
  }
}

@ApiTags("admin/site-pages")
@Controller("admin/site-pages")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class SitePagesAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "List ALL site pages (admin)" })
  list() {
    return this.prisma.sitePage.findMany({ orderBy: { order: "asc" } });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.prisma.sitePage.findUnique({ where: { id } });
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: "Create a site page (Privacy, Terms, About, Refund, Shipping...). ADMIN only — these are legal pages." })
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    return this.prisma.sitePage.create({
      data: {
        slug: body.slug.toLowerCase().trim(),
        titleBn: body.titleBn,
        titleEn: body.titleEn,
        contentBn: body.contentBn ?? "",
        contentEn: body.contentEn ?? "",
        isPublished: body.isPublished ?? false,
        showInFooter: body.showInFooter ?? true,
        order: body.order ?? 0,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        updatedBy: actorId,
      },
    });
  }

  @Patch(":id")
  @AdminOnly()
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    try {
      return await this.prisma.sitePage.update({
        where: { id },
        data: {
          ...(body.slug !== undefined && { slug: body.slug.toLowerCase().trim() }),
          ...(body.titleBn !== undefined && { titleBn: body.titleBn }),
          ...(body.titleEn !== undefined && { titleEn: body.titleEn }),
          ...(body.contentBn !== undefined && { contentBn: body.contentBn }),
          ...(body.contentEn !== undefined && { contentEn: body.contentEn }),
          ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
          ...(body.showInFooter !== undefined && { showInFooter: body.showInFooter }),
          ...(body.order !== undefined && { order: body.order }),
          ...(body.seoTitle !== undefined && { seoTitle: body.seoTitle }),
          ...(body.seoDescription !== undefined && { seoDescription: body.seoDescription }),
          updatedBy: actorId,
        },
      });
    } catch (e: any) {
      // P2002 = unique constraint (slug collision with another page)
      if (e?.code === "P2002") {
        throw new ConflictException("A page with that slug already exists");
      }
      throw e;
    }
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string) {
    await this.prisma.sitePage.delete({ where: { id } });
    return { ok: true };
  }
}
