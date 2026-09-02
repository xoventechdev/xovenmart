import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { EmailPurpose, Prisma, SmtpProvider } from "@prisma/client";
import { Request } from "express";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SecretsService } from "../../shared/crypto/secrets.service";
import { SmtpService } from "./smtp.service";
import {
  AssignPurposeDto,
  CreateSmtpProviderDto,
  SetDefaultProviderDto,
  TestSmtpDto,
  UpdateSmtpProviderDto,
} from "./smtp.dto";

/**
 * Strip encrypted-password columns from the row before returning to the
 * client. The client gets `hasPassword: true` instead so it can render the
 * "••••••••" mask and offer a "Replace password" flow on edit.
 */
function toClient(p: SmtpProvider) {
  const { passCipher: _c, passIv: _i, passTag: _t, ...rest } = p;
  return { ...rest, hasPassword: true };
}

/**
 * Translate a nodemailer / Node networking error into a stable
 * machine-readable `errorCode` + human-readable `message`. This lets the
 * UI distinguish "wrong password" from "firewall blocked the port"
 * instead of showing a generic 500.
 *
 * Recognized cases (most common first):
 *   - auth_failed        : username/password rejected by the SMTP server
 *   - connection_refused : host or port wrong, or local firewall blocking
 *   - dns_not_found      : hostname doesn't resolve (typo in host, no DNS)
 *   - tls_failed         : STARTTLS / certificate verification failed
 *   - timeout            : server didn't respond inside socket timeout
 *   - unknown            : anything else (still surfaces the original msg)
 */
type SmtpErrorCode =
  | "auth_failed"
  | "connection_refused"
  | "dns_not_found"
  | "tls_failed"
  | "timeout"
  | "unknown";

function classifySmtpError(e: any): { errorCode: SmtpErrorCode; message: string } {
  const raw: string = (e?.message || e?.toString?.() || "Unknown SMTP error")
    .toString()
    .trim();

  // nodemailer sets these well-known codes (see nodemailer/lib/xoauth2 etc.)
  if (e?.code === "EAUTH" || /535.*Authentication/i.test(raw) || /Invalid credentials/i.test(raw)) {
    return {
      errorCode: "auth_failed",
      message: "SMTP authentication failed — check username and password (or app password).",
    };
  }
  if (e?.code === "ECONNREFUSED" || /ECONNREFUSED|connect ECONNREFUSED/i.test(raw)) {
    return {
      errorCode: "connection_refused",
      message:
        "Connection refused by the SMTP server. Check host + port (587/465/25) and that your network allows outbound traffic to it.",
    };
  }
  if (
    e?.code === "ENOTFOUND" ||
    /ENOTFOUND|getaddrinfo ENOTFOUND/i.test(raw) ||
    /EAI_AGAIN/i.test(raw)
  ) {
    return {
      errorCode: "dns_not_found",
      message: "Could not resolve the SMTP hostname — check the host value for typos.",
    };
  }
  if (
    e?.code === "ETIMEDOUT" ||
    e?.code === "ESOCKETTIMEDOUT" ||
    /ETIMEDOUT|timeout/i.test(raw)
  ) {
    return {
      errorCode: "timeout",
      message: "SMTP server did not respond in time. Try a higher socket timeout or check the server.",
    };
  }
  if (
    /TLS|SSL|certificate|self[- ]signed|rejectUnauthorized/i.test(raw) ||
    e?.code === "ESOCKET" ||
    e?.code === "EPROTO"
  ) {
    return {
      errorCode: "tls_failed",
      message:
        "TLS negotiation failed. If this server uses a self-signed certificate, enable 'Verify TLS' → off for this provider and try again.",
    };
  }
  return { errorCode: "unknown", message: `SMTP error: ${raw || "unknown"}` };
}

@ApiTags("admin/system")
@Controller("admin/system/smtp")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class SmtpController {
  private readonly logger = new Logger(SmtpController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly smtp: SmtpService,
  ) {}

  // ─── Listing ────────────────────────────────────────────────

  @Get("providers")
  async listProviders() {
    const rows = await this.prisma.smtpProvider.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toClient);
  }

  @Get("purposes")
  async listPurposes() {
    const assignments = await this.prisma.smtpPurposeAssignment.findMany();
    const defaultProvider = await this.prisma.smtpProvider.findFirst({
      where: { isDefault: true },
      select: { id: true, label: true },
    });
    const map: Record<string, { providerId: string; providerLabel: string } | null> = {};
    for (const purpose of ["AUTH", "ORDERS", "BACKUPS", "MARKETING"] as EmailPurpose[]) {
      const a = assignments.find((x) => x.purpose === purpose);
      if (!a) {
        map[purpose] = null;
        continue;
      }
      const p = await this.prisma.smtpProvider.findUnique({
        where: { id: a.providerId },
        select: { id: true, label: true },
      });
      map[purpose] = p ? { providerId: p.id, providerLabel: p.label } : null;
    }
    return {
      default: defaultProvider ? { providerId: defaultProvider.id, label: defaultProvider.label } : null,
      purposes: map,
    };
  }

  // ─── Create / update / delete ───────────────────────────────

  @Post("providers")
  @AdminOnly()
  async create(@Body() body: CreateSmtpProviderDto, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    const enc = this.secrets.encrypt(body.pass);
    const row = await this.prisma.smtpProvider.create({
      data: {
        label: body.label,
        host: body.host,
        port: body.port,
        user: body.user,
        passCipher: enc.ciphertext,
        passIv: enc.iv,
        passTag: enc.tag,
        fromAddress: body.fromAddress,
        fromName: body.fromName,
        encryption: body.encryption,
        rejectUnauthorized: body.rejectUnauthorized ?? true,
        isActive: body.isActive ?? true,
        isDefault: false, // explicit set via PATCH /default
        createdById: actorId,
      },
    });
    await this.audit(actorId, "create", row.id, {
      label: row.label,
      host: row.host,
      fromAddress: row.fromAddress,
      encryption: row.encryption,
    });
    return toClient(row);
  }

  @Patch("providers/:id")
  @AdminOnly()
  async update(
    @Param("id") id: string,
    @Body() body: UpdateSmtpProviderDto,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId as string;
    const existing = await this.prisma.smtpProvider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("SMTP provider not found");

    const data: Prisma.SmtpProviderUpdateInput = {};
    const fields: string[] = [];

    if (body.label !== undefined)             { data.label = body.label;               fields.push("label"); }
    if (body.host !== undefined)              { data.host = body.host;                 fields.push("host"); }
    if (body.port !== undefined)              { data.port = body.port;                 fields.push("port"); }
    if (body.user !== undefined)              { data.user = body.user;                 fields.push("user"); }
    if (body.fromAddress !== undefined)       { data.fromAddress = body.fromAddress;   fields.push("fromAddress"); }
    if (body.fromName !== undefined)          { data.fromName = body.fromName;         fields.push("fromName"); }
    if (body.encryption !== undefined)        { data.encryption = body.encryption;     fields.push("encryption"); }
    if (body.rejectUnauthorized !== undefined){ data.rejectUnauthorized = body.rejectUnauthorized; fields.push("rejectUnauthorized"); }
    if (body.isActive !== undefined)           { data.isActive = body.isActive;         fields.push("isActive"); }

    if (body.pass !== undefined) {
      const enc = this.secrets.encrypt(body.pass);
      data.passCipher = enc.ciphertext;
      data.passIv = enc.iv;
      data.passTag = enc.tag;
      fields.push("pass");
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No fields to update");
    }

    const updated = await this.prisma.smtpProvider.update({ where: { id }, data });
    this.smtp.invalidateTransport(id);
    await this.audit(actorId, "update", id, { fields });
    return toClient(updated);
  }

  @Delete("providers/:id")
  @HttpCode(HttpStatus.OK)
  @AdminOnly()
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    const existing = await this.prisma.smtpProvider.findUnique({
      where: { id },
      include: { purposes: true },
    });
    if (!existing) throw new NotFoundException("SMTP provider not found");
    if (existing.purposes.length > 0) {
      throw new BadRequestException(
        `Cannot delete — provider is assigned to ${existing.purposes.length} purpose(s). Unassign first.`,
      );
    }
    await this.prisma.smtpProvider.delete({ where: { id } });
    this.smtp.invalidateTransport(id);
    await this.audit(actorId, "delete", id, { label: existing.label });
    return { ok: true };
  }

  // ─── Send test email ────────────────────────────────────────

  @Post("providers/:id/test")
  @AdminOnly()
  async test(@Param("id") id: string, @Body() body: TestSmtpDto, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    const provider = await this.prisma.smtpProvider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException("SMTP provider not found");

    const subject = body.subject || "XovenMart SMTP test";
    const text =
      body.text ||
      `This is a test email from XovenMart admin SMTP configuration. Sent at ${new Date().toISOString()}.`;
    const html = body.text
      ? `<p>${body.text.replace(/</g, "&lt;")}</p>`
      : `<p>This is a test email from <strong>XovenMart</strong> admin SMTP configuration.</p><p>Sent at ${new Date().toISOString()}.</p>`;

    let decryptedPass: string;
    try {
      decryptedPass = this.secrets.decrypt({
        ciphertext: provider.passCipher,
        iv: provider.passIv,
        tag: provider.passTag,
      });
    } catch (e: any) {
      // Most likely cause: SMTP_ENCRYPTION_KEY was rotated, leaving
      // existing rows undecryptable.
      await this.audit(actorId, "test_send", id, {
        to: body.to,
        ok: false,
        errorCode: "decrypt_failed",
        error: e?.message,
      });
      throw new BadGatewayException({
        message:
          "Failed to decrypt stored password — SMTP_ENCRYPTION_KEY may have been rotated. Re-save the provider with a fresh password.",
        errorCode: "decrypt_failed",
        provider: { id: provider.id, label: provider.label },
      });
    }

    // Use a one-off transporter (don't pollute the cache with a provider
    // the admin is still iterating on) and verify connectivity before
    // attempting sendMail so we can return a precise error.
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: provider.host,
      port: provider.port,
      secure: provider.encryption === "TLS",
      auth: { user: provider.user, pass: decryptedPass },
      tls: { rejectUnauthorized: provider.rejectUnauthorized },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    try {
      // verify() does EHLO + STARTTLS + AUTH handshake but sends no mail.
      // A failure here tells us auth/network is broken before we touch the user's inbox.
      await transporter.verify();
    } catch (e: any) {
      const { errorCode, message } = classifySmtpError(e);
      this.logger.warn(
        `[SMTP verify] provider=${provider.label} host=${provider.host}:${provider.port} code=${errorCode}: ${message}`,
      );
      await this.audit(actorId, "test_send", id, {
        to: body.to,
        ok: false,
        errorCode,
        error: message,
      });
      throw new BadGatewayException({
        message,
        errorCode,
        provider: { id: provider.id, label: provider.label, host: provider.host, port: provider.port },
      });
    }

    try {
      const info = await transporter.sendMail({
        from: `"${provider.fromName}" <${provider.fromAddress}>`,
        to: body.to,
        subject,
        text,
        html,
      });
      await this.audit(actorId, "test_send", id, {
        to: body.to,
        ok: true,
        messageId: info.messageId,
      });
      return {
        ok: true,
        messageId: info.messageId,
        provider: { id: provider.id, label: provider.label },
      };
    } catch (e: any) {
      const { errorCode, message } = classifySmtpError(e);
      this.logger.error(
        `[SMTP send] provider=${provider.label} host=${provider.host}:${provider.port} code=${errorCode}: ${message}`,
      );
      await this.audit(actorId, "test_send", id, {
        to: body.to,
        ok: false,
        errorCode,
        error: message,
      });
      throw new BadGatewayException({
        message,
        errorCode,
        provider: { id: provider.id, label: provider.label, host: provider.host, port: provider.port },
      });
    } finally {
      transporter.close();
    }
  }

  // ─── Default + purpose assignment ───────────────────────────

  @Patch("default")
  @AdminOnly()
  async setDefault(@Body() body: SetDefaultProviderDto, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    const target = await this.prisma.smtpProvider.findUnique({ where: { id: body.providerId } });
    if (!target) throw new NotFoundException("SMTP provider not found");

    const previous = await this.prisma.smtpProvider.findFirst({ where: { isDefault: true } });
    await this.prisma.$transaction([
      this.prisma.smtpProvider.updateMany({
        where: { isDefault: true, NOT: { id: body.providerId } },
        data: { isDefault: false },
      }),
      this.prisma.smtpProvider.update({
        where: { id: body.providerId },
        data: { isDefault: true },
      }),
    ]);
    await this.audit(actorId, "set_default", body.providerId, {
      previousDefaultId: previous?.id ?? null,
    });
    return { ok: true, defaultId: body.providerId };
  }

  @Patch("purposes")
  @AdminOnly()
  async assignPurpose(@Body() body: AssignPurposeDto, @Req() req: Request) {
    const actorId = (req as any).userId as string;

    if (body.providerId) {
      const target = await this.prisma.smtpProvider.findUnique({ where: { id: body.providerId } });
      if (!target) throw new NotFoundException("SMTP provider not found");
    }

    const previous = await this.prisma.smtpPurposeAssignment.findUnique({
      where: { purpose: body.purpose },
    });

    if (body.providerId) {
      await this.prisma.smtpPurposeAssignment.upsert({
        where: { purpose: body.purpose },
        update: { providerId: body.providerId },
        create: { purpose: body.purpose, providerId: body.providerId },
      });
    } else {
      // Clear assignment if exists
      if (previous) {
        await this.prisma.smtpPurposeAssignment.delete({ where: { purpose: body.purpose } });
      }
    }

    await this.audit(actorId, "assign_purpose", body.purpose, {
      providerId: body.providerId ?? null,
      previousProviderId: previous?.providerId ?? null,
    });
    return { ok: true };
  }

  // ─── Audit helper ───────────────────────────────────────────

  private async audit(actorId: string, action: string, entityId: string, diff: any) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "smtp_provider",
          entityId,
          action,
          diff: diff ?? {},
        },
      });
    } catch (e: any) {
      // Don't fail the user-visible op just because the audit write lost.
      this.logger.warn(`audit log write failed: ${e.message}`);
    }
  }
}
