import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

const LOG_PREFIX = "notification.log.";
const TEMPLATE_PREFIX = "template.";
const VALID_CHANNELS = new Set(["email", "sms", "push"]);

interface NotificationPayload {
  channel: string;
  recipient: string;
  subject?: string;
  body: string;
  status?: string;
  sentAt?: string;
  audience?: string;
}

interface TemplatePayload {
  subject?: string;
  body: string;
  variables?: string[];
}

function buildLogKey(channel: string, recipient: string, sentAt: Date) {
  const stamp = sentAt.getTime();
  const safe = recipient.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `${LOG_PREFIX}${channel}.${stamp}.${safe}`;
}

function parseLogKey(key: string): { channel: string; stamp: number; recipient: string } | null {
  if (!key.startsWith(LOG_PREFIX)) return null;
  const rest = key.slice(LOG_PREFIX.length);
  const parts = rest.split(".");
  if (parts.length < 3) return null;
  const channel = parts[0];
  const stamp = parseInt(parts[1], 10);
  const recipient = parts.slice(2).join(".");
  if (!channel || isNaN(stamp)) return null;
  return { channel, stamp, recipient };
}

@ApiTags("admin/notifications")
@Controller("admin/notifications")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────

  private async loadLogs(channel?: string, page = 1, perPage = 50) {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: LOG_PREFIX } },
      orderBy: { updatedAt: "desc" },
    });
    const items: any[] = [];
    for (const row of rows as any[]) {
      const parsed = parseLogKey(row.key);
      let payload: NotificationPayload = { channel: "", recipient: "", body: "" };
      try {
        payload = JSON.parse(row.value);
      } catch {
        payload = { channel: "", recipient: "", body: row.value };
      }
      if (channel && payload.channel !== channel) continue;
      items.push({
        id: row.key,
        channel: payload.channel,
        recipient: payload.recipient,
        subject: payload.subject ?? null,
        body: payload.body,
        status: payload.status ?? "QUEUED",
        audience: payload.audience ?? null,
        sentAt: payload.sentAt ?? row.updatedAt,
      });
    }
    const total = items.length;
    const start = (page - 1) * perPage;
    return { items: items.slice(start, start + perPage), page, perPage, total };
  }

  private async loadTemplates() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: TEMPLATE_PREFIX } },
      orderBy: { key: "asc" },
    });
    return rows
      .map((row: any) => {
        const rest = row.key.slice(TEMPLATE_PREFIX.length);
        const dot = rest.indexOf(".");
        if (dot < 0) return null;
        const channel = rest.slice(0, dot);
        const name = rest.slice(dot + 1);
        if (!VALID_CHANNELS.has(channel)) return null;
        let payload: TemplatePayload = { body: "" };
        try {
          payload = JSON.parse(row.value);
        } catch {
          payload = { body: row.value };
        }
        return {
          key: row.key,
          channel,
          name,
          subject: payload.subject ?? null,
          body: payload.body,
          variables: payload.variables ?? [],
          updatedAt: row.updatedAt,
        };
      })
      .filter(Boolean);
  }

  private async writeLog(payload: NotificationPayload, actorId?: string) {
    const sentAt = new Date();
    const key = buildLogKey(payload.channel, payload.recipient, sentAt);
    const value: NotificationPayload = {
      ...payload,
      sentAt: sentAt.toISOString(),
      status: payload.status ?? "QUEUED",
    };
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(value), updatedBy: actorId ?? null },
      create: { key, value: JSON.stringify(value), updatedBy: actorId ?? null },
    });
    return { id: key, ...value };
  }

  // ─── Routes ───────────────────────────────────────────────────

  @Get()
  async listAll(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    return this.loadLogs(undefined, page, perPage);
  }

  @Post("send")
  @AdminOnly()
  async send(@Body() body: any, @Req() req: Request) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body is required");
    }
    const channel = String(body.channel ?? "").toLowerCase();
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${body.channel}. Must be email, sms, or push.`);
    }
    if (!body.recipient || typeof body.recipient !== "string") {
      throw new BadRequestException("recipient (string) is required");
    }
    if (!body.body || typeof body.body !== "string") {
      throw new BadRequestException("body (string) is required");
    }
    const actorId = (req as any).userId;
    const payload: NotificationPayload = {
      channel,
      recipient: body.recipient,
      subject: body.subject,
      body: body.body,
      status: "LOGGED",
    };
    const result = await this.writeLog(payload, actorId);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorRole: "ADMIN",
        entity: "notification",
        entityId: result.id,
        action: "send_notification",
        diff: { channel, recipient: body.recipient, subject: body.subject },
      },
    });
    return { ok: true, id: result.id };
  }

  @Post("broadcast")
  @AdminOnly()
  async broadcast(@Body() body: any, @Req() req: Request) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body is required");
    }
    const channel = String(body.channel ?? "").toLowerCase();
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${body.channel}. Must be email, sms, or push.`);
    }
    if (!body.body || typeof body.body !== "string") {
      throw new BadRequestException("body (string) is required");
    }
    const audience = String(body.audience ?? "all").toLowerCase();
    if (!["all", "customers", "admins"].includes(audience)) {
      throw new BadRequestException(`Invalid audience: ${body.audience}. Must be all, customers, or admins.`);
    }
    const actorId = (req as any).userId;

    // Resolve recipients based on audience
    let recipients: string[] = [];
    if (audience === "all" || audience === "customers") {
      const users = await this.prisma.user.findMany({ select: { phone: true, email: true }, take: 1000 });
      for (const u of users) {
        if (channel === "sms" && u.phone) recipients.push(u.phone);
        if (channel === "email" && u.email) recipients.push(u.email);
      }
    }
    if (audience === "all" || audience === "admins") {
      const admins = await this.prisma.adminUser.findMany({ select: { email: true, phone: true }, take: 200 });
      for (const a of admins) {
        if (channel === "email" && a.email) recipients.push(a.email);
        if (channel === "sms" && a.phone) recipients.push(a.phone);
      }
    }
    // De-duplicate
    recipients = Array.from(new Set(recipients));

    const ids: string[] = [];
    for (const r of recipients) {
      const result = await this.writeLog(
        {
          channel,
          recipient: r,
          subject: body.subject,
          body: body.body,
          status: "BROADCAST",
          audience,
        },
        actorId,
      );
      ids.push(result.id);
    }
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "notification",
          entityId: `broadcast.${Date.now()}`,
          action: "broadcast_notification",
          diff: { channel, audience, recipientCount: ids.length, subject: body.subject },
        },
      });
    }
    return { ok: true, count: ids.length, ids };
  }

  @Get("templates")
  async templates() {
    return this.loadTemplates();
  }

  @Get("push")
  async pushLogs(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    return this.loadLogs("push", page, perPage);
  }

  @Get("sms")
  async smsLogs(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    return this.loadLogs("sms", page, perPage);
  }

  @Get("email")
  async emailLogs(@Query() q: { page?: number; perPage?: number }) {
    const page = q.page ?? 1;
    const perPage = Math.min(q.perPage ?? 50, 200);
    return this.loadLogs("email", page, perPage);
  }
}
