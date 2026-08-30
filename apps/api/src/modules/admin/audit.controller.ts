import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

interface ListQuery {
  page?: string | number;
  perPage?: string | number;
  actorId?: string;
  actorRole?: string;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
}

const ADMIN_ENTITIES = ["order", "product", "category", "coupon", "settings", "rider"];

@ApiTags("admin/audit")
@Controller("admin/audit")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  private parseQuery(q: ListQuery) {
    const page = Math.max(1, parseInt(String(q.page ?? 1), 10) || 1);
    const perPage = Math.min(500, Math.max(1, parseInt(String(q.perPage ?? 50), 10) || 50));
    const where: any = {};
    if (q.actorId) where.actorId = q.actorId;
    if (q.actorRole) where.actorRole = q.actorRole;
    if (q.entity) where.entity = q.entity;
    if (q.action) where.action = q.action;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    return { page, perPage, where };
  }

  private async enrich(items: any[]) {
    if (items.length === 0) return items;
    const actorIds = Array.from(new Set(items.map((i) => i.actorId).filter(Boolean)));
    const admins = actorIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const riders = actorIds.length
      ? await this.prisma.rider.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const adminMap = new Map<string, any>(admins.map((a: any) => [a.id, a]));
    const riderMap = new Map<string, any>(riders.map((r: any) => [r.id, r]));
    const userMap = new Map<string, any>(users.map((u: any) => [u.id, u]));
    return items.map((i: any) => {
      const a = adminMap.get(i.actorId);
      const r = riderMap.get(i.actorId);
      const u = userMap.get(i.actorId);
      return {
        ...i,
        actorName: a?.name ?? r?.name ?? u?.name ?? null,
        actorEmail: a?.email ?? r?.email ?? null,
      };
    });
  }

  @Get("logs")
  async list(@Query() q: ListQuery) {
    const { page, perPage, where } = this.parseQuery(q);
    const skip = (page - 1) * perPage;
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
      }),
    ]);
    return {
      items: await this.enrich(items),
      page,
      perPage,
      total,
    };
  }

  @Get("logs/:id")
  async getOne(@Param("id") id: string) {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw new BadRequestException("Log entry not found");
    const enriched = await this.enrich([row]);
    return enriched[0];
  }

  @Get("admin-actions")
  async adminActions(@Query() q: ListQuery) {
    const { page, perPage, where } = this.parseQuery(q);
    const finalWhere = {
      ...where,
      actorRole: "ADMIN" as const,
      entity: { in: ADMIN_ENTITIES },
    };
    const skip = (page - 1) * perPage;
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where: finalWhere }),
      this.prisma.auditLog.findMany({
        where: finalWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
      }),
    ]);
    return {
      items: await this.enrich(items),
      page,
      perPage,
      total,
    };
  }

  @Get("rider-actions")
  async riderActions(@Query() q: ListQuery) {
    const { page, perPage, where } = this.parseQuery(q);
    const finalWhere = {
      ...where,
      actorRole: "RIDER" as const,
    };
    const skip = (page - 1) * perPage;
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where: finalWhere }),
      this.prisma.auditLog.findMany({
        where: finalWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
      }),
    ]);
    return {
      items: await this.enrich(items),
      page,
      perPage,
      total,
    };
  }
}
