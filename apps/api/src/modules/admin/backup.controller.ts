import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { BackupService } from "./backup.service";
import {
  ListBackupsDto,
  ManualBackupDto,
  RestoreBackupDto,
  UpdateBackupSettingsDto,
} from "./backup.dto";

@ApiTags("admin/system")
@Controller("admin/system")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminBackupController {
  constructor(private readonly svc: BackupService) {}

  // ─── Settings (retention + scheduled-on) ─────────────────────

  @Get("backup-settings")
  async getSettings() {
    return this.svc.getSettings();
  }

  @Patch("backup-settings")
  @AdminOnly()
  async updateSettings(@Body() body: UpdateBackupSettingsDto, @Req() req: Request) {
    return this.svc.updateSettings({
      retentionDays: body.retentionDays,
      scheduledEnabled: body.scheduledEnabled,
    });
  }

  // ─── Listing + stats ─────────────────────────────────────────

  @Get("backups")
  async list(@Query() q: ListBackupsDto) {
    const page = q.page ?? 1;
    const perPage = q.perPage ?? 20;
    const [items, stats] = await Promise.all([
      this.svc.list({
        status: q.status,
        mode: q.mode,
        page,
        perPage,
      }),
      this.svc.getStats(),
    ]);
    return { ...items, stats };
  }

  // ─── Manual backup ───────────────────────────────────────────

  @Post("backups")
  @AdminOnly()
  async manualBackup(@Body() body: ManualBackupDto, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    return this.svc.runManualBackup({
      actorId,
      fileName: body.fileName,
      notes: body.notes,
    });
  }

  // ─── Download (stream) ───────────────────────────────────────

  @Get("backups/:id/download")
  @AdminOnly()
  async download(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const actorId = (req as any).userId as string;
    const { fileName, stream } = await this.svc.download(id, actorId);
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    );
    stream.on("error", (err) => {
      // Surface stream errors so the client sees a 500 instead of a
      // truncated download.
      // eslint-disable-next-line no-console
      console.error("backup stream error", err);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: "Stream error" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  }

  // ─── Restore (two-step safety dance) ─────────────────────────

  /**
   * Step 1 — preview. Returns the first ~200 lines of `pg_restore --list`
   * so the admin can review what would change. No DB writes happen here.
   */
  @Post("backups/:id/restore")
  @HttpCode(HttpStatus.OK)
  @AdminOnly()
  async restorePreview(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    const actorId = (req as any).userId as string;
    return this.svc.restorePreview(id, actorId);
  }

  /**
   * Step 2 — execute. Body must include `confirm: "RESTORE"` (case-sensitive).
   * Takes a safety dump first; aborts if the safety dump fails.
   */
  @Post("backups/:id/restore/execute")
  @HttpCode(HttpStatus.OK)
  @AdminOnly()
  async restoreExecute(
    @Param("id") id: string,
    @Body() body: RestoreBackupDto,
    @Req() req: Request,
  ) {
    if (body?.confirm !== "RESTORE") {
      throw new BadRequestException(
        'Type RESTORE exactly (case-sensitive) to confirm the restore',
      );
    }
    const actorId = (req as any).userId as string;
    return this.svc.restoreExecute(id, actorId, body.notes);
  }

  // ─── Delete ──────────────────────────────────────────────────

  @Delete("backups/:id")
  @AdminOnly()
  async remove(@Param("id") id: string, @Req() req: Request) {
    const actorId = (req as any).userId as string;
    return this.svc.deleteBackup(id, actorId);
  }

  // ─── Scan-disk ───────────────────────────────────────────────
  //
  // Two auth paths:
  //   (a) Admin UI button → JWT, normal guards above.
  //   (b) Bash script cron job → POST without JWT, but with
  //       `x-backup-webhook-token` header matching BACKUP_WEBHOOK_TOKEN.
  //
  // We check the token BEFORE the guards in (b) by exposing a separate
  // route — but to keep the pathing consistent we wire the token path
  // through a sibling endpoint below (`POST /backups/scan/webhook`).

  @Post("backups/scan")
  @AdminOnly()
  async scanFromAdmin() {
    return this.svc.scanDisk();
  }
}

/**
 * Webhook endpoint for the cron bash script.
 *
 * `infra/vps/backup.sh` curls this after each run with the
 * `x-backup-webhook-token` header set to `BACKUP_WEBHOOK_TOKEN`. No JWT
 * required — the shared token IS the credential.
 *
 * Kept as a separate controller so the AuthGuard doesn't get in the
 * way of the cron path.
 */
@ApiTags("admin/system")
@Controller("admin/system/backups/scan")
export class AdminBackupWebhookController {
  constructor(private readonly svc: BackupService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers("x-backup-webhook-token") token: string | undefined,
  ) {
    if (!this.svc.checkWebhookToken(token)) {
      // Don't leak whether the token was wrong vs. missing.
      throw new (await import("@nestjs/common")).UnauthorizedException(
        "Invalid webhook token",
      );
    }
    return this.svc.scanDisk();
  }
}
