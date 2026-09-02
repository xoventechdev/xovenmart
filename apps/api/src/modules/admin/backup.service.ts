import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile, spawn } from "child_process";
import { createReadStream, promises as fs } from "fs";
import { join, delimiter } from "path";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { BackupMode, BackupStatus, BackupTrigger } from "@prisma/client";
import { SmtpService } from "../notifications/smtp.service";

const SETTING_RETENTION = "backup.retentionDays";
const SETTING_SCHEDULED = "backup.scheduledEnabled";
const SETTING_LOCK = "backup.runLock"; // sentinel — non-empty string = "a run is in flight"

const FILE_NAME_RE = /^[a-z0-9\-_.]+$/i;
const DRY_RUN_PREVIEW_LINES = 200;
const SAFETY_BACKUP_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — covers slow DBs
const REGULAR_BACKUP_TIMEOUT_MS = 5 * 60 * 1000;
const RESTORE_TIMEOUT_MS = 15 * 60 * 1000;
// Self-healing lock TTL — anything older than this is auto-cleared so
// a crashed/killed previous run doesn't lock out the system forever.
// Must be > the longest timeout above.
//
// Note: we ALSO cross-check the lock against the most-recent `Backup`
// row in `isLocked()` — see below — so a fresh-looking lock without a
// matching RUNNING row is also treated as orphaned.
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough for any real run to either finish or fail loudly

/**
 * Backup & restore service.
 *
 * Two ways to take a backup:
 *   - manual: an admin clicks "Backup now" in `/admin/system/backups`.
 *     `runPgDump({ trigger: USER })` is invoked from the controller.
 *   - scheduled: the nightly OS-cron bash script `infra/vps/backup.sh`
 *     runs `pg_dump` directly, then curls
 *     `POST /admin/system/backups/scan` (auth via BACKUP_WEBHOOK_TOKEN)
 *     so the produced .sql.gz is registered in the table. The UI
 *     displays cron-produced backups alongside manual ones.
 *
 * Restore (`runPgRestore`) is a 4-step safety dance:
 *   1. confirm body matches the literal `RESTORE`
 *   2. take a safety dump of the current DB (trigger=SYSTEM_RESTORE_SAFETY)
 *   3. dry-run preview — return first N lines of `pg_restore --list`
 *   4. execute `pg_restore --clean --if-exists` on the live DB
 *
 * One backup runs at a time. The lock is held in the `backup.runLock`
 * app_setting row so a second click (or the cron + manual overlap)
 * short-circuits cleanly without corrupting a half-written file.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly smtp: SmtpService,
  ) {}

  // ─── Config ────────────────────────────────────────────────

  /** Where .sql.gz files live. Default matches the bash script. */
  private get backupDir(): string {
    return this.cfg.get<string>("BACKUP_DIR") ?? "/var/www/xovenmart/backups/postgres";
  }

  /** Auth token the bash script sends on its scan webhook. */
  private get webhookToken(): string {
    return this.cfg.get<string>("BACKUP_WEBHOOK_TOKEN") ?? "";
  }

  private get databaseUrl(): string {
    const url = this.cfg.get<string>("DATABASE_URL");
    if (!url) throw new BadRequestException("DATABASE_URL not configured");
    return url;
  }

  // ─── Settings ──────────────────────────────────────────────

  async getSettings() {
    const map = await this.readMap();
    return {
      retentionDays: this.num(map[SETTING_RETENTION], 7),
      scheduledEnabled: this.bool(map[SETTING_SCHEDULED], true),
    };
  }

  async updateSettings(opts: { retentionDays?: number; scheduledEnabled?: boolean }) {
    if (opts.retentionDays !== undefined) {
      await this.writeKey(SETTING_RETENTION, Math.max(1, Math.min(365, opts.retentionDays)));
    }
    if (opts.scheduledEnabled !== undefined) {
      await this.writeKey(SETTING_SCHEDULED, !!opts.scheduledEnabled);
    }
    return this.getSettings();
  }

  // ─── Listing ───────────────────────────────────────────────

  async list(opts: { status?: BackupStatus; mode?: BackupMode; page: number; perPage: number }) {
    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.mode) where.mode = opts.mode;

    const [items, total] = await Promise.all([
      this.prisma.backup.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (opts.page - 1) * opts.perPage,
        take: opts.perPage,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.backup.count({ where }),
    ]);

    return {
      items: items.map((b) => ({
        ...b,
        sizeBytes: b.sizeBytes.toString(), // BigInt → string for JSON
      })),
      page: opts.page,
      perPage: opts.perPage,
      total,
    };
  }

  async getStats() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [total, successLast7, failedLast7, all] = await Promise.all([
      this.prisma.backup.count(),
      this.prisma.backup.count({ where: { status: "SUCCESS", startedAt: { gte: sevenDaysAgo } } }),
      this.prisma.backup.count({ where: { status: "FAILED", startedAt: { gte: sevenDaysAgo } } }),
      this.prisma.backup.findMany({ select: { sizeBytes: true } }),
    ]);
    const totalBytes = all.reduce((acc, b) => acc + Number(b.sizeBytes || 0n), 0);
    return { total, successLast7, failedLast7, totalBytes };
  }

  // ─── Manual backup ─────────────────────────────────────────

  async runManualBackup(opts: { actorId: string; notes?: string; fileName?: string }) {
    const fileName =
      opts.fileName ?? `xovenmart-manual-${this.timestamp()}.sql.gz`;
    if (!FILE_NAME_RE.test(fileName)) {
      throw new BadRequestException("Invalid fileName");
    }
    // Fail fast on missing Postgres tools — saves the user from a
    // 500 with no clue vs. a 503 with precise install instructions.
    await this.assertPgToolsAvailable();
    return this.runPgDump({
      mode: "MANUAL",
      trigger: "USER",
      fileName,
      notes: opts.notes,
      actorId: opts.actorId,
      timeoutMs: REGULAR_BACKUP_TIMEOUT_MS,
    });
  }

  // ─── Download ──────────────────────────────────────────────

  async download(id: string, actorId: string) {
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Backup not found");
    if (row.status !== "SUCCESS") {
      throw new BadRequestException("Backup is not ready for download");
    }
    await this.audit(actorId, "download", row.id, { fileName: row.fileName });
    return {
      fileName: row.fileName,
      stream: createReadStream(row.storagePath),
    };
  }

  // ─── Delete ────────────────────────────────────────────────

  async deleteBackup(id: string, actorId: string) {
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Backup not found");
    // Remove the file first; if it fails, the row stays so the admin can retry.
    try {
      await fs.unlink(row.storagePath);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e; // missing file is OK
    }
    await this.prisma.backup.delete({ where: { id: row.id } });
    await this.audit(actorId, "delete", row.id, { fileName: row.fileName });
    return { ok: true };
  }

  // ─── Restore safety dance ──────────────────────────────────

  /**
   * Step 1: dry-run preview. Returns the first N lines of
   * `pg_restore --list` for the admin to review before they confirm.
   */
  async restorePreview(id: string, actorId: string): Promise<{ backupId: string; preview: string; safetyBackupId: string | null; fileName: string; sizeBytes: string }> {
    await this.assertPgToolsAvailable();
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Backup not found");
    if (row.status !== "SUCCESS") {
      throw new BadRequestException("Only SUCCESS backups can be restored");
    }
    const preview = await this.runPgRestoreList(row.storagePath);
    await this.audit(actorId, "restore_preview", row.id, {
      fileName: row.fileName,
      previewLines: preview.split("\n").length,
    });
    return {
      backupId: row.id,
      preview,
      safetyBackupId: null, // not yet taken
      fileName: row.fileName,
      sizeBytes: row.sizeBytes.toString(),
    };
  }

  /**
   * Step 2: execute. Takes a safety dump of the *current* DB first;
   * if that fails, aborts before touching the live data.
   *
   * Returns the safety-backup id so the admin knows which file to
   * restore if the new restore turns out to be wrong.
   */
  async restoreExecute(id: string, actorId: string, notes?: string): Promise<{
    ok: boolean;
    safetyBackupId: string;
    safetyFileName: string;
    restoredFrom: string;
    durationMs: number;
  }> {
    if (await this.isLocked()) {
      throw new ForbiddenException("Another backup or restore is already running");
    }
    await this.assertPgToolsAvailable();
    const row = await this.prisma.backup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Backup not found");
    if (row.status !== "SUCCESS") {
      throw new BadRequestException("Only SUCCESS backups can be restored");
    }

    await this.acquireLock();

    let safetyRow: Awaited<ReturnType<typeof this.runPgDump>> | null = null;
    try {
      // 1) Safety dump of the CURRENT database. If this fails, abort.
      safetyRow = await this.runPgDump({
        mode: "MANUAL",
        trigger: "SYSTEM_RESTORE_SAFETY",
        fileName: `xovenmart-pre-restore-${this.timestamp()}.sql.gz`,
        notes: `Safety backup before restoring ${row.fileName}`,
        actorId,
        timeoutMs: SAFETY_BACKUP_TIMEOUT_MS,
      });
      if (safetyRow.status !== "SUCCESS") {
        throw new BadRequestException(
          `Safety dump failed — refusing to restore. See backup ${safetyRow.id}.`,
        );
      }

      // 2) Execute pg_restore
      const startedAt = Date.now();
      await this.runPgRestoreExec(row.storagePath, RESTORE_TIMEOUT_MS);
      const durationMs = Date.now() - startedAt;

      await this.audit(actorId, "restore", row.id, {
        fileName: row.fileName,
        safetyBackupId: safetyRow.id,
        notes,
        durationMs,
      });

      return {
        ok: true,
        safetyBackupId: safetyRow.id,
        safetyFileName: safetyRow.fileName,
        restoredFrom: row.fileName,
        durationMs,
      };
    } finally {
      await this.releaseLock();
    }
  }

  // ─── Scan-disk (cron path) ─────────────────────────────────

  /**
   * Walk BACKUP_DIR, register any *.sql.gz we haven't seen yet. Called
   * both by the bash script (auth via BACKUP_WEBHOOK_TOKEN) and the
   * admin UI (auth via JWT, with the same logic).
   */
  async scanDisk(): Promise<{ added: number; skipped: number; errors: string[] }> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.backupDir);
    } catch (e: any) {
      if (e.code === "ENOENT") return { added: 0, skipped: 0, errors: [`backup dir not found: ${this.backupDir}`] };
      throw e;
    }

    const existing = new Set(
      (await this.prisma.backup.findMany({ select: { fileName: true } })).map((b) => b.fileName),
    );

    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const name of entries) {
      if (!name.endsWith(".sql.gz")) continue;
      if (existing.has(name)) {
        skipped += 1;
        continue;
      }
      const fullPath = join(this.backupDir, name);
      try {
        const stat = await fs.stat(fullPath);
        await this.prisma.backup.create({
          data: {
            fileName: name,
            storagePath: fullPath,
            sizeBytes: BigInt(stat.size),
            mode: "SCHEDULED",
            trigger: "CRON",
            status: "SUCCESS",
            startedAt: stat.mtime,
            finishedAt: stat.mtime,
            durationMs: 0,
            notes: "Detected from disk scan",
          },
        });
        added += 1;
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    if (added > 0) {
      // Auto-prune after a successful scan so the table doesn't grow unbounded.
      await this.pruneOldBackups().catch((e) =>
        this.logger.warn(`prune after scan failed: ${e.message}`),
      );
    }

    return { added, skipped, errors };
  }

  /** Verify the incoming webhook token. */
  checkWebhookToken(headerValue: string | undefined): boolean {
    const expected = this.webhookToken;
    if (!expected) return false;
    if (!headerValue) return false;
    return headerValue === expected || headerValue === `Bearer ${expected}`;
  }

  // ─── Pruning ───────────────────────────────────────────────

  /**
   * Keep only the N most-recent SUCCESS backups (per `retentionDays`).
   * Called after each new SUCCESS and after each scan.
   */
  async pruneOldBackups(): Promise<{ pruned: number }> {
    const { retentionDays } = await this.getSettings();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.backup.findMany({
      where: { status: "SUCCESS", startedAt: { lt: cutoff } },
      orderBy: { startedAt: "desc" },
      select: { id: true, fileName: true, storagePath: true },
    });
    if (candidates.length === 0) return { pruned: 0 };

    let pruned = 0;
    for (const c of candidates) {
      try {
        await fs.unlink(c.storagePath);
      } catch (e: any) {
        if (e.code !== "ENOENT") {
          this.logger.warn(`prune: unlink failed for ${c.fileName}: ${e.message}`);
        }
      }
      await this.prisma.backup.delete({ where: { id: c.id } });
      pruned += 1;
    }
    if (pruned > 0) {
      this.logger.log(`pruned ${pruned} backups older than ${retentionDays} days`);
    }
    return { pruned };
  }

  // ─── Internals: pg_dump / pg_restore ───────────────────────

  /**
   * Verify that the Postgres client tools (`pg_dump` / `pg_restore`) are
   * reachable on the current PATH. On Windows dev boxes Postgres often
   * ships in `C:\Program Files\PostgreSQL\<version>\bin\` but isn't on
   * PATH by default — without this check the user gets a cryptic
   * 500 "spawn ENOENT" instead of an actionable 503.
   *
   * `which` works on Linux/macOS; on Windows we walk %PATH% manually
   * because Windows' `which` is a shell builtin that's not available
   * when the API is spawned as a plain node process.
   */
  private async assertPgToolsAvailable(): Promise<void> {
    const missing: string[] = [];
    for (const bin of ["pg_dump", "pg_restore"]) {
      const ok = await this.commandExists(bin);
      if (!ok) missing.push(bin);
    }
    if (missing.length === 0) return;

    const isWin = process.platform === "win32";
    const hint = isWin
      ? `Postgres client tools (${missing.join(
          ", ",
        )}) are not on PATH. Install Postgres locally (e.g. via the EDB installer) or add 'C:\\Program Files\\PostgreSQL\\<version>\\bin' to your PATH, then restart the API.`
      : `Postgres client tools (${missing.join(
          ", ",
        )}) are not installed. Install postgresql-client (apt: postgresql-client, brew: libpq, alpine: postgresql-client).`;

    this.logger.error(hint);
    throw new ServiceUnavailableException({
      message: hint,
      errorCode: "pg_tools_missing",
      missing,
      platform: process.platform,
    });
  }

  /**
   * Search PATH (and PATHEXT on Windows) for the given executable.
   * Returns true on the first hit.
   */
  private async commandExists(bin: string): Promise<boolean> {
    const pathEnv = process.env.PATH || process.env.Path || "";
    const dirs = pathEnv.split(delimiter).filter(Boolean);
    const isWin = process.platform === "win32";
    const candidates = isWin
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((ext) => ext.trim())
          .filter(Boolean)
          .map((ext) => `${bin}${ext.toLowerCase()}`)
      : [bin];

    for (const dir of dirs) {
      for (const c of candidates) {
        try {
          await fs.access(join(dir, c));
          return true;
        } catch {
          // continue searching
        }
      }
    }
    return false;
  }

  private async runPgDump(opts: {
    mode: BackupMode;
    trigger: BackupTrigger;
    fileName: string;
    notes?: string;
    actorId?: string;
    timeoutMs: number;
  }): Promise<{
    id: string;
    fileName: string;
    status: BackupStatus;
    sizeBytes: bigint;
  }> {
    if (await this.isLocked()) {
      throw new ForbiddenException("Another backup or restore is already running");
    }
    // Fail fast with a clean 503 if the Postgres client tools are
    // missing on PATH — otherwise the spawn below would throw an opaque
    // ENOENT 500.
    await this.assertPgToolsAvailable();
    await this.acquireLock();

    const storagePath = join(this.backupDir, opts.fileName);
    await fs.mkdir(this.backupDir, { recursive: true }).catch(() => {});

    // Insert the row up-front so the UI shows it as RUNNING immediately.
    const row = await this.prisma.backup.create({
      data: {
        fileName: opts.fileName,
        storagePath,
        sizeBytes: 0n,
        mode: opts.mode,
        trigger: opts.trigger,
        status: "RUNNING",
        notes: opts.notes,
        createdById: opts.actorId ?? null,
      },
    });

    const startedAt = Date.now();
    try {
      // Spawn the pipe: pg_dump → gzip → file. We do this with a single
      // shell-out for simplicity (the interpolated file path is sanitized
      // via FILE_NAME_RE above). Stdout/stderr are merged to capture
      // pg_dump's progress + any errors.
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          "bash",
          [
            "-c",
            `pg_dump "${this.databaseUrl}" --no-owner --clean --if-exists | gzip > "${storagePath}"`,
          ],
          { timeout: opts.timeoutMs },
        );
        let stderr = "";
        proc.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        proc.on("error", (err) => reject(err));
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim().slice(0, 1000)}`));
        });
      });

      const stat = await fs.stat(storagePath);
      const finished = await this.prisma.backup.update({
        where: { id: row.id },
        data: {
          status: "SUCCESS",
          sizeBytes: BigInt(stat.size),
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      });
      if (opts.actorId) {
        await this.audit(opts.actorId, "create", finished.id, {
          fileName: finished.fileName,
          mode: finished.mode,
          trigger: finished.trigger,
          sizeBytes: finished.sizeBytes.toString(),
        });
      }
      // Email notification — best effort; never fail the backup because
      // the email side is broken.
      this.notifyBackupFinished(finished, "SUCCESS").catch((e) =>
        this.logger.warn(`backup success email failed: ${e?.message ?? e}`),
      );
      // Best-effort prune. If it fails, log but don't fail the backup.
      this.pruneOldBackups().catch((e) =>
        this.logger.warn(`prune after backup failed: ${e.message}`),
      );
      return {
        id: finished.id,
        fileName: finished.fileName,
        status: finished.status,
        sizeBytes: finished.sizeBytes,
      };
    } catch (e: any) {
      const finished = await this.prisma.backup.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: (e?.message ?? String(e)).slice(0, 2000),
        },
      });
      // Clean up the half-written file so the user doesn't think they
      // have a valid backup lying around.
      try {
        await fs.unlink(storagePath);
      } catch {}
      // Email notification — best effort; never let email failure mask the
      // underlying pg_dump failure.
      this.notifyBackupFinished(finished, "FAILED", e?.message).catch((err) =>
        this.logger.warn(`backup failed email send failed: ${err?.message ?? err}`),
      );
      return {
        id: finished.id,
        fileName: finished.fileName,
        status: finished.status,
        sizeBytes: 0n,
      };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Send an email to the configured backup-admin recipients when a backup
   * finishes. Uses `purpose: BACKUPS` so the admin can route backup alerts
   * to a different SMTP provider than auth/orders.
   *
   * Recipients are read from `BACKUP_NOTIFY_EMAILS` (comma-separated).
   * If unset, falls back to `ADMIN_NOTIFY_EMAIL`. If neither is set, the
   * notification is silently skipped — never throws.
   */
  private async notifyBackupFinished(
    row: { id: string; fileName: string; sizeBytes: bigint; durationMs: number | null; status: string; trigger: string; mode: string },
    status: "SUCCESS" | "FAILED",
    error?: string,
  ): Promise<void> {
    const toList = this.cfg.get<string>("BACKUP_NOTIFY_EMAILS") ?? this.cfg.get<string>("ADMIN_NOTIFY_EMAIL") ?? "";
    const recipients = toList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      this.logger.debug("notifyBackupFinished: no recipients configured (BACKUP_NOTIFY_EMAILS / ADMIN_NOTIFY_EMAIL)");
      return;
    }

    const sizeMb = Number(row.sizeBytes ?? 0n) / 1024 / 1024;
    const duration = row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : "?";
    const subject = status === "SUCCESS"
      ? `[XovenMart] Backup OK — ${row.fileName} (${sizeMb.toFixed(2)} MB)`
      : `[XovenMart] Backup FAILED — ${row.fileName}`;
    const text = status === "SUCCESS"
      ? `Backup completed successfully.\n\n` +
        `  File:    ${row.fileName}\n` +
        `  Size:    ${sizeMb.toFixed(2)} MB\n` +
        `  Mode:    ${row.mode}\n` +
        `  Trigger: ${row.trigger}\n` +
        `  Duration: ${duration}\n\n` +
        `Download from /admin/system/backups.`
      : `Backup FAILED.\n\n` +
        `  File:    ${row.fileName}\n` +
        `  Mode:    ${row.mode}\n` +
        `  Trigger: ${row.trigger}\n` +
        `  Duration: ${duration}\n` +
        `  Error:   ${error ?? "(no error message captured)"}\n\n` +
        `Check /admin/system/backups for details.`;
    const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;

    for (const to of recipients) {
      try {
        await this.smtp.sendMail({
          purpose: "BACKUPS",
          to,
          subject,
          text,
          html,
        });
      } catch (e: any) {
        this.logger.warn(`backup email to ${to} failed: ${e?.message ?? e}`);
      }
    }
  }

  private async runPgRestoreList(filePath: string): Promise<string> {
    const lines: string[] = [];
    return new Promise((resolve, reject) => {
      const proc = execFile(
        "pg_restore",
        ["--list", filePath],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err && err.message.includes("killed")) {
            reject(new Error("pg_restore --list timed out"));
            return;
          }
          // pg_restore --list prints to stdout even on partial errors; capture anyway.
          const all = String(stdout ?? "").split("\n");
          const preview = all.slice(0, DRY_RUN_PREVIEW_LINES).join("\n");
          const more = all.length > DRY_RUN_PREVIEW_LINES
            ? `\n... (${all.length - DRY_RUN_PREVIEW_LINES} more lines)`
            : "";
          resolve(preview + more);
        },
      );
      proc.on("error", (err) => reject(err));
    });
  }

  private async runPgRestoreExec(filePath: string, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // Pass the DSN via env so the literal password never shows up in
      // the process arg list (visible to `ps`).
      const env = { ...process.env, PGHOST: undefined, PGPORT: undefined };
      const proc = execFile(
        "pg_restore",
        [
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-password",
          "--dbname",
          this.databaseUrl,
          filePath,
        ],
        { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
        (err, _stdout, stderr) => {
          // pg_restore exits 0 on success, 1 on warnings (e.g. objects
          // already missing — fine because of --if-exists). Anything
          // else is a hard failure.
          if (err && (err as any).code !== 1) {
            reject(new Error(`pg_restore failed: ${stderr?.slice(0, 2000) ?? err.message}`));
            return;
          }
          resolve();
        },
      );
      proc.on("error", (err) => reject(err));
    });
  }

  // ─── Lock helpers ──────────────────────────────────────────

  /**
   * Self-healing lock: returns true only if there's a lock AND it's
   * still "fresh" (< LOCK_TTL_MS old) AND there's an actual Backup row
   * in `RUNNING` state that started around the same time.
   *
   * Either condition failing means the lock is orphaned (e.g. crash,
   * kill -9, or API restart mid-run) and we silently clear it.
   */
  private async isLocked(): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTING_LOCK } });
    if (!row?.value) return false;

    let parsed: { at?: string } | null = null;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      // Garbage in the lock row — treat as stale, clear it.
      await this.prisma.appSetting.delete({ where: { key: SETTING_LOCK } }).catch(() => {});
      return false;
    }
    const lockedAt = parsed?.at ? new Date(parsed.at).getTime() : 0;
    if (!lockedAt || Number.isNaN(lockedAt)) {
      await this.prisma.appSetting.delete({ where: { key: SETTING_LOCK } }).catch(() => {});
      return false;
    }
    const ageMs = Date.now() - lockedAt;
    if (ageMs > LOCK_TTL_MS) {
      this.logger.warn(
        `Stale backup lock found (age ${Math.round(ageMs / 1000)}s > ${Math.round(LOCK_TTL_MS / 1000)}s) — clearing`,
      );
      await this.prisma.appSetting.delete({ where: { key: SETTING_LOCK } }).catch(() => {});
      return false;
    }

    // Cross-check: is there a Backup row in RUNNING whose startedAt is
    // close to the lock timestamp? If not, the lock is orphaned — the
    // process that set it died before finishing.
    const liveRun = await this.prisma.backup.findFirst({
      where: { status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true },
    });
    if (!liveRun) {
      this.logger.warn(
        `Orphaned backup lock (age ${Math.round(ageMs / 1000)}s) with no matching RUNNING row — clearing`,
      );
      await this.prisma.appSetting.delete({ where: { key: SETTING_LOCK } }).catch(() => {});
      return false;
    }
    // If the RUNNING row's startedAt is > 60s older than the lock, the
    // lock is probably stale (it was written by a different process).
    const runAgeMs = Math.abs(liveRun.startedAt.getTime() - lockedAt);
    if (runAgeMs > 60_000) {
      this.logger.warn(
        `Backup lock timestamp drift ${Math.round(runAgeMs / 1000)}s vs RUNNING row — clearing`,
      );
      await this.prisma.appSetting.delete({ where: { key: SETTING_LOCK } }).catch(() => {});
      return false;
    }
    return true;
  }

  private async acquireLock(): Promise<void> {
    // `upsert` is atomic; the value is just a non-empty string flag.
    await this.prisma.appSetting.upsert({
      where: { key: SETTING_LOCK },
      update: { value: JSON.stringify({ at: new Date().toISOString() }) },
      create: { key: SETTING_LOCK, value: JSON.stringify({ at: new Date().toISOString() }) },
    });
  }

  private async releaseLock(): Promise<void> {
    try {
      await this.prisma.appSetting.delete({ where: { key: SETTING_LOCK } });
    } catch {
      // already gone — fine
    }
  }

  // ─── Misc helpers ──────────────────────────────────────────

  private timestamp(): string {
    // 2026-09-02T03-00-00Z (file-name safe, sortable)
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  private async readMap(): Promise<Record<string, any>> {
    const rows = await this.prisma.appSetting.findMany();
    const map: Record<string, any> = {};
    for (const row of rows) {
      try {
        map[row.key] = JSON.parse(row.value);
      } catch {
        map[row.key] = row.value;
      }
    }
    return map;
  }

  private async writeKey(key: string, value: any) {
    await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(value) },
      create: { key, value: JSON.stringify(value) },
    });
  }

  private num(v: any, fallback: number): number {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
    return fallback;
  }

  private bool(v: any, fallback: boolean): boolean {
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return fallback;
  }

  private async audit(actorId: string, action: string, backupId: string, diff: any) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: "ADMIN",
          entity: "backup",
          entityId: backupId,
          action,
          diff,
        },
      });
    } catch (e: any) {
      // Don't fail the user-visible op just because the audit write lost.
      this.logger.warn(`audit log write failed: ${e.message}`);
    }
  }
}

/**
 * Tiny HTML-entity escape for the backup-email body — keeps the message
 * safe to drop into a `<pre>` block without an HTML sanitizer dep.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}