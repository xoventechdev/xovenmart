import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import * as bcrypt from "bcryptjs";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

@ApiTags("admin/categories")
@Controller("admin/categories")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
      include: {
        parent: { select: { id: true, nameEn: true, nameBn: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  @Post()
  async create(@Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const slug = await this.uniqueSlug(body.slugEn ?? body.slug ?? body.nameEn);
    const c = await this.prisma.category.create({
      data: {
        slug,
        nameBn: body.nameBn,
        nameEn: body.nameEn,
        parentId: body.parentId || null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "category", entityId: c.id, action: "create", diff: body },
    });
    return c;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const actorId = (req as any).userId;
    const c = await this.prisma.category.update({
      where: { id },
      data: {
        ...(body.nameBn !== undefined && { nameBn: body.nameBn }),
        ...(body.nameEn !== undefined && { nameEn: body.nameEn }),
        ...(body.descriptionBn !== undefined && { descriptionBn: body.descriptionBn }),
        ...(body.descriptionEn !== undefined && { descriptionEn: body.descriptionEn }),
        ...(body.iconUrl !== undefined && { iconUrl: body.iconUrl }),
        ...(body.parentId !== undefined && { parentId: body.parentId || null }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "category", entityId: id, action: "update", diff: body },
    });
    return c;
  }

  @Delete(":id")
  @AdminOnly()
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId;
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    const productCount = await this.prisma.product.count({ where: { categoryId: id } });
    if (childCount > 0 || productCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${childCount} sub-categories and ${productCount} products still reference this category. Deactivate instead.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: { actorId, actorRole: "ADMIN", entity: "category", entityId: id, action: "delete" },
    });
    return { ok: true };
  }

  private async uniqueSlug(seed: string): Promise<string> {
    const base = (seed || "cat").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    let s = base;
    for (let i = 1; i < 50; i++) {
      const exists = await this.prisma.category.findUnique({ where: { slug: s } });
      if (!exists) return s;
      s = `${base}-${i}`;
    }
    throw new BadRequestException("Could not generate unique slug");
  }
}
