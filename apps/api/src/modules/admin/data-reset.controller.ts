import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import {
  AdminOnly,
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";
import { DataResetService, ResetResult } from "./data-reset.service";
import { DataResetDto } from "./data-reset.dto";

/**
 * Admin-only destructive demo-data reset endpoint.
 *
 *   GET  /admin/system/data-reset/preview  — counts of what WOULD be wiped (no side effects).
 *   POST /admin/system/data-reset          — gated by typed phrase; takes an auto-backup
 *                                              first, then runs an FK-safe cascade in a
 *                                              single Prisma transaction.
 *
 * Both routes require ADMIN role — the @AdminOnly() decorator on POST
 * additionally rejects the MANAGER role (so a manager can never
 * accidentally trigger a wipe from the API, even though they can reach
 * this controller's GET endpoint).
 *
 * Defense in depth (mirrors the service-level guards):
 *   1. JWT role === ADMIN (RolesGuard)
 *   2. MANAGER is blocked by ManagerGuard on @AdminOnly() routes
 *   3. Body must include `confirm: "WIPE DEMO DATA"` (case-sensitive)
 *   4. Pre-wipe pg_dump via BackupService — aborts before any delete if it fails
 *   5. FK-safe cascade in a single $transaction
 *   6. AuditLog row written on success
 */
@ApiTags("admin/system")
@Controller("admin/system/data-reset")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class DataResetController {
  constructor(private readonly svc: DataResetService) {}

  /**
   * Returns the current row counts for every table that would be wiped.
   * Cheap to call — ten `count()` queries in a single read-only
   * transaction. Useful for the admin UI to show "what's at stake"
   * before the operator types the confirmation phrase.
   */
  @Get("preview")
  @HttpCode(HttpStatus.OK)
  async preview() {
    return this.svc.previewCounts();
  }

  /**
   * Execute the wipe. Body MUST contain `confirm: "WIPE DEMO DATA"`.
   *
   * Returns the count of every deleted row + the auto-backup's id and
   * filename (so the admin can find it on the backups page and restore
   * if the wipe turns out to be wrong).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @AdminOnly()
  async reset(@Body() body: DataResetDto, @Req() req: Request): Promise<ResetResult> {
    const actorId = (req as any).userId as string;
    return this.svc.reset(actorId, body.confirm ?? "");
  }
}
