import { Controller, Get, Logger, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../shared/prisma/prisma.module";
import {
  Audience,
  AuthGuard,
  ManagerGuard,
  Roles,
  RolesGuard,
} from "../../shared/jwt/guards";

/**
 * API Health dashboard data.
 *
 * Designed for the admin `/admin/system/api-health` page. All numbers are
 * cheap to compute — no `pg_dump`, no external SMTP connections — so the
 * page can poll this endpoint every 10s without side effects.
 *
 * Field notes:
 *   - `db`: a simple `SELECT 1` ping + measured latency.
 *   - `memory`: process RSS + Node heap; lets the operator spot leaks.
 *   - `lastBackup`: most recent *finished* backup (SUCCESS or FAILED),
 *     so they can see when the system last produced a snapshot.
 *   - `smtp`: provider counts so they know if mail will actually send.
 *     Does NOT decrypt passwords or open a socket — that's what the
 *     "Send test email" button on the SMTP page is for.
 *   - `backupLock`: whether a backup is *currently* in flight (matches
 *     what the running backup banner in the UI is reacting to).
 *   - `recentErrors`: last 10 audit rows that look like failures
 *     (`action in {test_send, run, restore}` with `ok=false`,
 *     `status=FAILED`, or an explicit `errorCode`). Useful for an
 *     operator to spot "SMTP broken for 2 hours" without leaving the
 *     dashboard.
 */
@ApiTags("admin/system")
@Controller("admin/system/api-health")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class ApiHealthController {
  private readonly logger = new Logger(ApiHealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: "Snapshot of API health for the admin dashboard",
  })
  async snapshot() {
    const [
      dbProbe,
      lastFinished,
      smtpCounts,
      recentErrors,
      backupLockRow,
    ] = await Promise.all([
      this.probeDb(),
      this.lastBackup(),
      this.smtpCounts(),
      this.recentErrors(),
      this.prisma.appSetting.findUnique({ where: { key: "backup.runLock" } }),
    ]);

    const memory = process.memoryUsage();

    return {
      now: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: +(memory.rss / 1024 / 1024).toFixed(1),
        heapUsedMb: +(memory.heapUsed / 1024 / 1024).toFixed(1),
        heapTotalMb: +(memory.heapTotal / 1024 / 1024).toFixed(1),
      },
      db: dbProbe,
      lastBackup: lastFinished,
      smtp: smtpCounts,
      backupLock: !!backupLockRow?.value,
      recentErrors,
    };
  }

  // ─── helpers ──────────────────────────────────────────────

  private async probeDb(): Promise<{ status: "ok" | "error"; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      // `$queryRaw` with a parameter — Prisma still escapes it, but
      // we explicitly don't want to depend on any table existing.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", latencyMs: Date.now() - start };
    } catch (e: any) {
      return {
        status: "error",
        latencyMs: Date.now() - start,
        error: e?.message ?? String(e),
      };
    }
  }

  private async lastBackup(): Promise<{
    fileName: string;
    status: string;
    finishedAt: string | null;
    durationMs: number | null;
    trigger: string;
    error: string | null;
  } | null> {
    // Latest *finished* row — SUCCESS or FAILED — so the operator sees
    // when the system last produced (or failed to produce) a snapshot.
    const row = await this.prisma.backup.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: {
        fileName: true,
        status: true,
        finishedAt: true,
        durationMs: true,
        trigger: true,
        error: true,
      },
    });
    if (!row) return null;
    return {
      fileName: row.fileName,
      status: row.status,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      durationMs: row.durationMs ?? null,
      trigger: row.trigger,
      error: row.error ?? null,
    };
  }

  private async smtpCounts(): Promise<{
    total: number;
    active: number;
    default: string | null;
    purposesAssigned: number;
  }> {
    const [total, active, def, purposes] = await Promise.all([
      this.prisma.smtpProvider.count(),
      this.prisma.smtpProvider.count({ where: { isActive: true } }),
      this.prisma.smtpProvider.findFirst({
        where: { isDefault: true },
        select: { label: true },
      }),
      this.prisma.smtpPurposeAssignment.count(),
    ]);
    return {
      total,
      active,
      default: def?.label ?? null,
      purposesAssigned: purposes,
    };
  }

  /**
   * Walk recent audit rows and surface anything that smells like a
   * failure. We deliberately don't query by `entity` alone because
   * the interesting diffs are inside JSON — `ok=false`, `errorCode`
   * present, or `status=FAILED` — which can appear across
   * `smtp_provider`, `backup`, and admin controllers.
   */
  private async recentErrors(): Promise<
    Array<{
      id: string;
      entity: string;
      entityId: string;
      action: string;
      actorId: string | null;
      diff: any;
      createdAt: string;
    }>
  > {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    const flagged = rows.filter((r) => {
      const d: any = r.diff ?? {};
      if (d.ok === false) return true;
      if (typeof d.errorCode === "string" && d.errorCode) return true;
      if (d.status === "FAILED") return true;
      if (typeof d.error === "string" && d.error) return true;
      return false;
    });
    return flagged.slice(0, 10).map((r) => ({
      id: r.id,
      entity: r.entity,
      entityId: r.entityId,
      action: r.action,
      actorId: r.actorId,
      diff: r.diff,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}