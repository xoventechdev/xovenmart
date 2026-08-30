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
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";

const TEMPLATE_PREFIX = "template.";
const VALID_CHANNELS = new Set(["email", "sms", "push"]);

interface TemplatePayload {
  subject?: string;
  body: string;
  variables?: string[];
}

interface BuiltinTemplate {
  channel: string;
  name: string;
  subject?: string;
  body: string;
  variables?: string[];
}

const BUILTINS: BuiltinTemplate[] = [
  {
    channel: "email",
    name: "order_placed",
    subject: "Order {{orderNo}} confirmed",
    body: "Hi {{customerName}},\n\nThanks for shopping at XovenMart. Your order {{orderNo}} has been received.\n\nTotal: ৳{{total}}\nDelivery to: {{address}}\n\nTrack your order: {{url}}\n\n— XovenMart Team",
    variables: ["customerName", "orderNo", "total", "address", "url"],
  },
  {
    channel: "email",
    name: "order_shipped",
    subject: "Your order {{orderNo}} is on the way",
    body: "Hi {{customerName}},\n\nGreat news — your order {{orderNo}} is out for delivery with rider {{riderName}} ({{riderPhone}}).\n\nTrack: {{url}}\n\n— XovenMart Team",
    variables: ["customerName", "orderNo", "riderName", "riderPhone", "url"],
  },
  {
    channel: "email",
    name: "order_delivered",
    subject: "Order {{orderNo}} delivered",
    body: "Hi {{customerName}},\n\nYour order {{orderNo}} has been delivered. We hope you enjoyed the experience.\n\nRate your order: {{reviewUrl}}\n\n— XovenMart Team",
    variables: ["customerName", "orderNo", "reviewUrl"],
  },
  {
    channel: "sms",
    name: "order_placed",
    body: "Your XovenMart order {{orderNo}} is confirmed. Total: ৳{{total}}. Track: {{url}}",
    variables: ["orderNo", "total", "url"],
  },
  {
    channel: "sms",
    name: "otp",
    body: "Your XovenMart OTP is {{code}}. Valid for {{minutes}} minutes.",
    variables: ["code", "minutes"],
  },
  {
    channel: "push",
    name: "order_status",
    body: "Order {{orderNo}} - {{status}}",
    variables: ["orderNo", "status"],
  },
];

function buildKey(channel: string, name: string) {
  return `${TEMPLATE_PREFIX}${channel}.${name}`;
}

function parseKey(key: string): { channel: string; name: string } | null {
  if (!key.startsWith(TEMPLATE_PREFIX)) return null;
  const rest = key.slice(TEMPLATE_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  return { channel: rest.slice(0, dot), name: rest.slice(dot + 1) };
}

function renderTemplate(body: string, variables: Record<string, any>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => {
    const v = variables?.[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

@ApiTags("admin/templates")
@Controller("admin/templates")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Seed built-in templates if missing — idempotent. */
  private async ensureBuiltins() {
    const keys = BUILTINS.map((b) => buildKey(b.channel, b.name));
    const existing = await this.prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    const existingSet = new Set(existing.map((e: { key: string }) => e.key));
    const missing = BUILTINS.filter((b) => !existingSet.has(buildKey(b.channel, b.name)));
    for (const b of missing) {
      const payload: TemplatePayload = { subject: b.subject, body: b.body, variables: b.variables };
      await this.prisma.appSetting.upsert({
        where: { key: buildKey(b.channel, b.name) },
        update: { value: JSON.stringify(payload) },
        create: {
          key: buildKey(b.channel, b.name),
          value: JSON.stringify(payload),
          updatedBy: null,
        },
      });
    }
  }

  private async loadAll() {
    await this.ensureBuiltins();
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: TEMPLATE_PREFIX } },
      orderBy: { key: "asc" },
    });
    const items = rows.map((row: any) => {
      const parsed = parseKey(row.key);
      let payload: TemplatePayload = { body: "" };
      try {
        payload = JSON.parse(row.value);
      } catch {
        payload = { body: row.value };
      }
      return {
        key: row.key,
        channel: parsed?.channel ?? "unknown",
        name: parsed?.name ?? row.key,
        subject: payload.subject,
        body: payload.body,
        variables: payload.variables ?? [],
        updatedAt: row.updatedAt,
      };
    });
    return items;
  }

  private async loadOne(channel: string, name: string) {
    await this.ensureBuiltins();
    const key = buildKey(channel, name);
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!row) throw new NotFoundException(`Template ${channel}/${name} not found`);
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
      subject: payload.subject,
      body: payload.body,
      variables: payload.variables ?? [],
      updatedAt: row.updatedAt,
    };
  }

  @Get()
  async list() {
    return this.loadAll();
  }

  @Get(":channel/:name")
  async getOne(@Param("channel") channel: string, @Param("name") name: string) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    return this.loadOne(channel, name);
  }

  @Put(":channel/:name")
  @AdminOnly()
  async upsert(
    @Param("channel") channel: string,
    @Param("name") name: string,
    @Body() body: TemplatePayload,
    @Req() req: Request,
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    if (!body || typeof body.body !== "string") {
      throw new BadRequestException("body (string) is required");
    }
    const actorId = (req as any).userId;
    const key = buildKey(channel, name);
    const payload: TemplatePayload = {
      subject: body.subject,
      body: body.body,
      variables: body.variables ?? [],
    };
    await this.prisma.appSetting.upsert({
      where: { key },
      update: {
        value: JSON.stringify(payload),
        updatedBy: actorId ?? null,
      },
      create: {
        key,
        value: JSON.stringify(payload),
        updatedBy: actorId ?? null,
      },
    });
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "template",
          entityId: key,
          action: "update_template",
          diff: { channel, name, ...payload },
        },
      });
    }
    return this.loadOne(channel, name);
  }

  @Delete(":channel/:name")
  @AdminOnly()
  async remove(
    @Param("channel") channel: string,
    @Param("name") name: string,
    @Req() req: Request,
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    const key = buildKey(channel, name);
    const exists = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!exists) {
      return { ok: true, deleted: false };
    }
    await this.prisma.appSetting.delete({ where: { key } });
    const actorId = (req as any).userId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "template",
          entityId: key,
          action: "delete_template",
          diff: { channel, name },
        },
      });
    }
    return { ok: true, deleted: true };
  }

  @Post(":channel/:name/preview")
  async preview(
    @Param("channel") channel: string,
    @Param("name") name: string,
    @Body() body: { variables?: Record<string, any> },
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    const tpl = await this.loadOne(channel, name);
    const variables = body?.variables ?? {};
    const renderedBody = renderTemplate(tpl.body, variables);
    const renderedSubject = tpl.subject ? renderTemplate(tpl.subject, variables) : undefined;
    return {
      rendered: renderedBody,
      renderedSubject,
    };
  }
}
