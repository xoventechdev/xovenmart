import {
  BadRequestException,
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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

const TICKET_PREFIX = "support.ticket.";

interface TicketPayload {
  ticketNo: string;
  customerPhone: string;
  customerName?: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  reply?: string;
  createdAt: string;
  updatedAt: string;
}

function buildTicketKey(ticketNo: string) {
  return `${TICKET_PREFIX}${ticketNo}`;
}

function parseTicketKey(key: string): { ticketNo: string } | null {
  if (!key.startsWith(TICKET_PREFIX)) return null;
  return { ticketNo: key.slice(TICKET_PREFIX.length) };
}

function generateTicketNo() {
  const d = new Date();
  const yymm = `${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `SUP-${yymm}-${seq}`;
}

@ApiTags("admin/support")
@Controller("admin/support")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminSupportController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Tickets ──────────────────────────────────────────────────

  private async loadTickets(filter?: { status?: string; priority?: string }) {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: TICKET_PREFIX } },
      orderBy: { updatedAt: "desc" },
    });
    const items: any[] = [];
    for (const row of rows) {
      const parsed = parseTicketKey(row.key);
      let payload: TicketPayload;
      try {
        payload = JSON.parse(row.value);
      } catch {
        continue;
      }
      if (filter?.status && payload.status !== filter.status) continue;
      if (filter?.priority && payload.priority !== filter.priority) continue;
      items.push({
        id: row.key,
        ticketNo: parsed?.ticketNo ?? payload.ticketNo,
        customerPhone: payload.customerPhone,
        customerName: payload.customerName ?? null,
        subject: payload.subject,
        message: payload.message,
        status: payload.status,
        priority: payload.priority,
        reply: payload.reply ?? null,
        createdAt: payload.createdAt ?? row.createdAt,
        updatedAt: payload.updatedAt ?? row.updatedAt,
      });
    }
    return items;
  }

  @Get("tickets")
  async listTickets(@Query() q: { status?: string; priority?: string }) {
    const items = await this.loadTickets({
      status: q.status,
      priority: q.priority,
    });
    return { items };
  }

  @Get("tickets/:id")
  async getTicket(@Param("id") id: string) {
    // id is the full AppSetting key OR the ticketNo
    const key = id.startsWith(TICKET_PREFIX) ? id : buildTicketKey(id);
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!row) return null;
    let payload: TicketPayload;
    try {
      payload = JSON.parse(row.value);
    } catch {
      return null;
    }
    const parsed = parseTicketKey(row.key);
    return {
      id: row.key,
      ticketNo: parsed?.ticketNo ?? payload.ticketNo,
      customerPhone: payload.customerPhone,
      customerName: payload.customerName ?? null,
      subject: payload.subject,
      message: payload.message,
      status: payload.status,
      priority: payload.priority,
      reply: payload.reply ?? null,
      createdAt: payload.createdAt ?? row.createdAt,
      updatedAt: payload.updatedAt ?? row.updatedAt,
    };
  }

  @Post("tickets")
  @AdminOnly()
  async createTicket(@Body() body: any, @Req() req: Request) {
    if (!body?.customerPhone) {
      throw new BadRequestException("customerPhone is required");
    }
    if (!body?.subject) {
      throw new BadRequestException("subject is required");
    }
    if (!body?.message) {
      throw new BadRequestException("message is required");
    }
    const actorId = (req as any).userId;
    const ticketNo = generateTicketNo();
    const now = new Date().toISOString();
    const payload: TicketPayload = {
      ticketNo,
      customerPhone: body.customerPhone,
      customerName: body.customerName,
      subject: body.subject,
      message: body.message,
      status: body.status ?? "OPEN",
      priority: body.priority ?? "NORMAL",
      reply: body.reply,
      createdAt: now,
      updatedAt: now,
    };
    await this.prisma.appSetting.upsert({
      where: { key: buildTicketKey(ticketNo) },
      update: { value: JSON.stringify(payload), updatedBy: actorId ?? null },
      create: {
        key: buildTicketKey(ticketNo),
        value: JSON.stringify(payload),
        updatedBy: actorId ?? null,
      },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "support_ticket",
          entityId: ticketNo,
          action: "create",
          diff: { subject: body.subject, priority: payload.priority },
        },
      });
    }
    return { id: buildTicketKey(ticketNo), ticketNo };
  }

  @Patch("tickets/:id")
  async updateTicket(@Param("id") id: string, @Body() body: any, @Req() req: Request) {
    const key = id.startsWith(TICKET_PREFIX) ? id : buildTicketKey(id);
    const existing = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!existing) {
      throw new BadRequestException(`Ticket ${id} not found`);
    }
    let payload: TicketPayload;
    try {
      payload = JSON.parse(existing.value);
    } catch {
      payload = {
        ticketNo: id,
        customerPhone: "",
        subject: "",
        message: "",
        status: "OPEN",
        priority: "NORMAL",
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      };
    }
    const allowedStatus = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
    const allowedPriority = ["LOW", "NORMAL", "HIGH", "URGENT"];
    if (body.status !== undefined && !allowedStatus.includes(body.status)) {
      throw new BadRequestException(`Invalid status: ${body.status}. Must be one of: ${allowedStatus.join(", ")}`);
    }
    if (body.priority !== undefined && !allowedPriority.includes(body.priority)) {
      throw new BadRequestException(`Invalid priority: ${body.priority}. Must be one of: ${allowedPriority.join(", ")}`);
    }
    if (body.status !== undefined) payload.status = body.status;
    if (body.priority !== undefined) payload.priority = body.priority;
    if (body.reply !== undefined) payload.reply = body.reply;
    payload.updatedAt = new Date().toISOString();
    const actorId = (req as any).userId;
    await this.prisma.appSetting.update({
      where: { key },
      data: { value: JSON.stringify(payload), updatedBy: actorId ?? null },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "support_ticket",
          entityId: payload.ticketNo,
          action: "update",
          diff: body,
        },
      });
    }
    return {
      id: key,
      ticketNo: payload.ticketNo,
      status: payload.status,
      priority: payload.priority,
      reply: payload.reply,
      updatedAt: payload.updatedAt,
    };
  }

  @Delete("tickets/:id")
  @AdminOnly()
  async deleteTicket(@Param("id") id: string, @Req() req: Request) {
    const key = id.startsWith(TICKET_PREFIX) ? id : buildTicketKey(id);
    const existing = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!existing) return { ok: true, deleted: false };
    await this.prisma.appSetting.delete({ where: { key } });
    const actorId = (req as any).userId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "support_ticket",
          entityId: id,
          action: "delete",
        },
      });
    }
    return { ok: true, deleted: true };
  }

  // ─── FAQs ───────────────────────────────────────────────────
  //
  // FAQ CRUD was moved to `site-pages/faqs.controller.ts`
  // (`FaqsAdminController`). The previous duplicate endpoints here
  // (`/admin/support/faqs*`) were removed so the admin FAQ Manager and the
  // public `/faq` page share a single source of truth (the Faq model +
  // `GET /api/v1/faqs/public`). See that controller for the canonical
  // implementation.
}
