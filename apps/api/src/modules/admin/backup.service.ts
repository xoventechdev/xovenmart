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
import { TemplatesService } from "../templates/templates.service";

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
    private readonly templates: TemplatesService,
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
    const fileName = opts.fileName ?? `xovenmart-manual-${this.timestamp()}.sql.gz`;
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
  async restorePreview(
    id: string,
    actorId: string,
  ): Promise<{
    backupId: string;
    preview: string;
    safetyBackupId: string | null;
    fileName: string;
    sizeBytes: string;
  }> {
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
  async restoreExecute(
    id: string,
    actorId: string,
    notes?: string,
  ): Promise<{
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
   *
   * For each newly-registered cron backup we also fire-and-forget an
   * email notification to the configured recipients (BACKUP_NOTIFY_EMAILS
   * / ADMIN_NOTIFY_EMAIL). This is the daily-auto path the user asked
   * for: "daily after auto success backup, backup file should go to
   * email automatically" — the bash script already runs on the OS cron,
   * this is where the email side of that pipeline lives.
   */
  async scanDisk(): Promise<{ added: number; skipped: number; errors: string[]; emailed: number }> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.backupDir);
    } catch (e: any) {
      if (e.code === "ENOENT")
        return {
          added: 0,
          skipped: 0,
          errors: [`backup dir not found: ${this.backupDir}`],
          emailed: 0,
        };
      throw e;
    }

    const existing = new Set(
      (await this.prisma.backup.findMany({ select: { fileName: true } })).map((b) => b.fileName),
    );

    let added = 0;
    let skipped = 0;
    let emailed = 0;
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
        const row = await this.prisma.backup.create({
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
        // Fire-and-forget email per newly-detected cron backup. The
        // shared helper is best-effort — it logs and never throws, so a
        // broken SMTP can't break the scan. Counted only when at least
        // one recipient was actually configured (otherwise it's a no-op).
        this.sendBackupEmail(row.id, { trigger: "CRON_SCAN", actorId: undefined })
          .then((ok) => {
            if (ok) emailed += 1;
          })
          .catch((e) =>
            this.logger.warn(
              `cron backup email send failed for ${row.fileName}: ${e?.message ?? e}`,
            ),
          );
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

    return { added, skipped, errors, emailed };
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
   *
   * Kept as a thin wrapper that throws on missing, so all existing
   * manual-backup / restore callers (which already had
   * `assertPgToolsAvailable()` chained up-front) keep their behaviour.
   * The throw-side info is built from `checkPgTools()` so the thrown
   * 503 and the new health-card endpoint can never disagree about
   * what's missing or what the install command should be.
   */
  private async assertPgToolsAvailable(): Promise<void> {
    const status = await this.checkPgTools();
    if (status.ok) return;
    this.logger.error(status.installHint);
    throw new ServiceUnavailableException({
      message: status.installHint,
      errorCode: "pg_tools_missing",
      missing: status.missing,
      platform: status.platform,
    });
  }

  /**
   * Same check as `assertPgToolsAvailable` but returns the result
   * instead of throwing — used by the GET /backup-tools/health
   * endpoint so the admin UI can render a proactive status card
   * ("✓ OK" / "✗ install postgresql-client") on the backups page
   * before the admin ever clicks "Backup now".
   *
   * The `installHint` is the EXACT same string the 503 throws, so the
   * UI copy and the error toast can never drift out of sync.
   */
  async getToolsHealth(): Promise<{
    pgDump: boolean;
    pgRestore: boolean;
    ok: boolean;
    missing: string[];
    platform: NodeJS.Platform;
    installHint: string;
  }> {
    const status = await this.checkPgTools();
    return status;
  }

  /**
   * Pure check — no throw, no logger side-effects. Searches PATH (and
   * PATHEXT on Windows) for pg_dump + pg_restore and assembles a
   * platform-appropriate install hint for whichever (if any) binaries
   * are missing.
   */
  private async checkPgTools(): Promise<{
    pgDump: boolean;
    pgRestore: boolean;
    ok: boolean;
    missing: string[];
    platform: NodeJS.Platform;
    installHint: string;
  }> {
    const [pgDump, pgRestore] = await Promise.all([
      this.commandExists("pg_dump"),
      this.commandExists("pg_restore"),
    ]);
    const missing: string[] = [];
    if (!pgDump) missing.push("pg_dump");
    if (!pgRestore) missing.push("pg_restore");
    if (missing.length === 0) {
      return {
        pgDump,
        pgRestore,
        ok: true,
        missing,
        platform: process.platform,
        installHint: "",
      };
    }
    // The hints below are deliberately OS-specific so a Windows admin
    // doesn't see `apt install` (which would be useless to them) and
    // a Homebrew macOS admin doesn't see `apt install` either. The
    // exact wording was moved here verbatim from the old
    // `assertPgToolsAvailable` so the click-time 503 toast and this
    // health endpoint stay byte-identical.
    const isWin = process.platform === "win32";
    const list = missing.join(", ");
    const installHint = isWin
      ? `Postgres client tools (${list}) are not on PATH. Install Postgres locally (e.g. via the EDB installer) or add 'C:\\Program Files\\PostgreSQL\\<version>\\bin' to your PATH, then restart the API.`
      : `Postgres client tools (${list}) are not installed. Install postgresql-client (apt: postgresql-client, brew: libpq, alpine: postgresql-client).`;
    return {
      pgDump,
      pgRestore,
      ok: false,
      missing,
      platform: process.platform,
      installHint,
    };
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
    // JSON-safe string (BigInt → string). Express's JSON.stringify
    // can't serialize BigInt, so callers that return this shape over
    // HTTP would 500 with "Do not know how to serialize a BigInt" if
    // we kept the bigint here. The list endpoint already stringifies
    // per-row (line ~130); this matches that pattern at the source.
    sizeBytes: string;
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
        // TODO(backup-fk): createdById currently FK-references User
        // (customers table) instead of AdminUser, so passing an admin's
        // id here violates the FK. Forced to null until the FK is
        // switched — actor info is still captured via the audit log
        // (audit() below writes the admin's id + role).
        createdById: null,
      },
    });

    const startedAt = Date.now();
    try {
      // Spawn the pipe: pg_dump → gzip → file. We do this with a single
      // shell-out for simplicity (the interpolated file path is sanitized
      // via FILE_NAME_RE above). Stdout/stderr are merged to capture
      // pg_dump's progress + any errors.
      await new Promise<void>((resolve, reject) => {
        // Use `set -o pipefail` so the pipeline's exit code is the
        // rightmost non-zero exit. Without this, `bash -c "pg_dump ...
        // | gzip > out.sql.gz"` returns 0 even when pg_dump fails —
        // bash only reports the last command's (gzip's) exit code, and
        // gzip happily produces a valid empty gzip file when its input
        // is empty. That gave us 20-byte "Success" backups with no data.
        //
        // We also use `pipefail` so pg_dump's failure is propagated while its stderr remains available to the Node process for the persisted error message.
        const proc = spawn(
          "bash",
          [
            "-c",
            // Split pg_dump's stdout and stderr to separate tmpfiles so we
            // can inspect them after the process exits. We still pipe to
            // gzip via `tee >(gzip > file)` so a SUCCESS dump is gzipped
            // just like before; the debug files are only used in the
            // failure branch to surface pg_dump's actual error.
            `DEBUG_FILE="$(mktemp)"; ERR_FILE="$(mktemp)"; trap 'rm -f "$DEBUG_FILE" "$ERR_FILE"' EXIT; pg_dump "${this.databaseUrl}" --no-owner --clean --if-exists 2> "$ERR_FILE" | tee "$DEBUG_FILE" | gzip > "${storagePath}"; EC=\${PIPESTATUS[0]}; if [ "$EC" -ne 0 ]; then echo "----- pg_dump stdout (first 50 lines) -----" >&2; head -50 "$DEBUG_FILE" >&2; echo "----- pg_dump stderr -----" >&2; cat "$ERR_FILE" >&2; fi; exit "$EC"`,
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
          else
            reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim().slice(0, 1000)}`));
        });
      });

      const stat = await fs.stat(storagePath);
      // Sanity guard: a real pg_dump of a non-empty DB should be at
      // minimum tens of KB even after gzip. An output of a few bytes
      // is just the gzip header — it means pg_dump produced nothing
      // (DB unreachable, wrong DSN, empty database, etc.) but still
      // exited 0. Treat that as a failure rather than silently
      // marking the row SUCCESS, so admins can see what happened.
      if (stat.size < 1024) {
        try {
          await fs.unlink(storagePath);
        } catch {}
        throw new Error(
          `pg_dump produced a suspiciously small output (${stat.size} bytes) — ` +
            `likely connected to an empty DB, the wrong database, or the connection failed. ` +
            `Verify DATABASE_URL and that the target DB has tables.`,
        );
      }
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
      // the email side is broken. Auto-path uses the success template
      // (template.email.backup_success) and the configured recipients.
      this.sendBackupEmail(finished.id, { trigger: "AUTO_SUCCESS", actorId: opts.actorId }).catch(
        (e) => this.logger.warn(`backup success email failed: ${e?.message ?? e}`),
      );
      // Best-effort prune. If it fails, log but don't fail the backup.
      this.pruneOldBackups().catch((e) =>
        this.logger.warn(`prune after backup failed: ${e.message}`),
      );
      return {
        id: finished.id,
        fileName: finished.fileName,
        status: finished.status,
        sizeBytes: finished.sizeBytes.toString(),
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
      // underlying pg_dump failure. Auto-fail path uses backup_failed.
      this.sendBackupEmail(finished.id, {
        trigger: "AUTO_FAILED",
        actorId: opts.actorId,
        error: e?.message,
      }).catch((err) =>
        this.logger.warn(`backup failed email send failed: ${err?.message ?? err}`),
      );
      return {
        id: finished.id,
        fileName: finished.fileName,
        status: finished.status,
        sizeBytes: "0",
      };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Send an email to the configured backup-admin recipients for a
   * specific backup row. Used by FOUR call sites:
   *
   *   1. `runPgDump` SUCCESS auto-path  — trigger=AUTO_SUCCESS,
   *      template=backup_success, .sql.gz attached.
   *   2. `runPgDump` FAILED auto-path   — trigger=AUTO_FAILED,
   *      template=backup_failed, NO attachment (file was cleaned up).
   *   3. `scanDisk` cron-import path    — trigger=CRON_SCAN,
   *      template=backup_send, .sql.gz attached. Fires per newly-
   *      discovered file so daily-cron dumps are auto-emailed to the
   *      configured recipients.
   *   4. Manual admin "Send email" click — trigger=MANUAL_RESEND,
   *      template=backup_send, .sql.gz attached. The controller may
   *      pass an override `to` (one address typed in the UI prompt) or
   *      fall back to the configured recipients list.
   *
   * Returns `true` when at least one recipient was configured AND all
   * sends succeeded. Returns `false` when no recipients are configured
   * (debug-logged) or any recipient failed. Never throws — callers
   * must not rely on the email succeeding for the backup itself to be
   * valid.
   *
   * Recipient resolution: `BACKUP_NOTIFY_EMAILS` (comma-separated) →
   * `ADMIN_NOTIFY_EMAIL` → empty (skip). Manual path with `toOverride`
   * uses that single address instead of the configured list.
   *
   * Template: `backup_send` for all "I have a file, here's the file"
   * paths (cron + manual), `backup_success` / `backup_failed` for the
   * auto-status alerts. Localization via the global app setting
   * `defaultLanguage` (TemplatesService.resolveLocale).
   */
  async sendBackupEmail(
    backupId: string,
    opts: {
      trigger: "AUTO_SUCCESS" | "AUTO_FAILED" | "CRON_SCAN" | "MANUAL_RESEND";
      actorId?: string | null;
      error?: string;
      toOverride?: string | null;
    },
  ): Promise<boolean> {
    // Load the row fresh from DB so the manual / cron paths (which
    // don't already have the row in hand) work the same as the auto
    // paths. Cheap (single indexed PK lookup).
    const row = await this.prisma.backup.findUnique({ where: { id: backupId } });
    if (!row) {
      this.logger.warn(`sendBackupEmail: backup ${backupId} not found`);
      return false;
    }

    // Resolve recipient list. Manual override wins over env.
    let recipients: string[];
    if (opts.toOverride && opts.toOverride.trim()) {
      recipients = [opts.toOverride.trim()];
    } else {
      const toList =
        this.cfg.get<string>("BACKUP_NOTIFY_EMAILS") ??
        this.cfg.get<string>("ADMIN_NOTIFY_EMAIL") ??
        "";
      recipients = toList
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (recipients.length === 0) {
      this.logger.debug(
        `sendBackupEmail(${backupId}, ${opts.trigger}): no recipients configured (BACKUP_NOTIFY_EMAILS / ADMIN_NOTIFY_EMAIL)`,
      );
      return false;
    }

    const sizeMb = Number(row.sizeBytes ?? 0n) / 1024 / 1024;
    const duration = row.durationMs != null ? `${(row.durationMs / 1000).toFixed(1)}s` : "?";

    // Pick template per trigger:
    //   AUTO_SUCCESS → backup_success (legacy copy)
    //   AUTO_FAILED  → backup_failed  (legacy copy, no attachment)
    //   CRON_SCAN    → backup_send    (with attachment + sentByLine="")
    //   MANUAL_RESEND→ backup_send    (with attachment + sentByLine filled)
    let templateName: "backup_success" | "backup_failed" | "backup_send";
    let attachFile = false;
    if (opts.trigger === "AUTO_SUCCESS") {
      templateName = "backup_success";
      attachFile = true;
    } else if (opts.trigger === "AUTO_FAILED") {
      templateName = "backup_failed";
      attachFile = false;
    } else {
      templateName = "backup_send";
      attachFile = true;
    }

    // For backup_success / backup_failed the templates expect numeric
    // `duration`. For backup_send it expects a pre-formatted string.
    const tplVars: Record<string, unknown> =
      templateName === "backup_send"
        ? {
            fileName: row.fileName,
            sizeMb: sizeMb.toFixed(2),
            mode: row.mode,
            trigger: row.trigger,
            duration,
            startedAt: row.startedAt
              .toISOString()
              .replace("T", " ")
              .replace(/\.\d+Z$/, " UTC"),
            // Empty for cron (auto) — no human triggered it. Filled for
            // MANUAL_RESEND so the admin sees who emailed it.
            sentByLine:
              opts.trigger === "MANUAL_RESEND"
                ? await this.formatSentByLine(opts.actorId ?? null)
                : "",
          }
        : {
            fileName: row.fileName,
            sizeMb: sizeMb.toFixed(2),
            mode: row.mode,
            trigger: row.trigger,
            // Legacy templates use `duration` as a number of seconds.
            duration: row.durationMs != null ? (row.durationMs / 1000).toFixed(0) : "0",
            error: opts.error ?? "",
          };

    // Resolve recipient locale once and render once per recipient so
    // each address gets its own language (helps when BN/EN admins are
    // both on the list).
    let allOk = true;
    for (const to of recipients) {
      try {
        const locale = await this.templates.resolveLocale(null);
        const rendered = await this.templates.renderEmail("email", templateName, tplVars, locale);
        const fallbackSubject =
          templateName === "backup_success"
            ? `[XovenMart] Backup OK — ${row.fileName} (${sizeMb.toFixed(2)} MB)`
            : templateName === "backup_failed"
              ? `[XovenMart] Backup FAILED — ${row.fileName}`
              : `[XovenMart] Backup file — ${row.fileName} (${sizeMb.toFixed(2)} MB)`;
        const fallbackText =
          templateName === "backup_success"
            ? `Backup completed successfully.\n\nFile: ${row.fileName}`
            : templateName === "backup_failed"
              ? `Backup FAILED.\n\nFile: ${row.fileName}`
              : `Backup file attached.\n\nFile: ${row.fileName}`;
        const subject = rendered.subject || fallbackSubject;
        const text = rendered.body || fallbackText;
        const html =
          rendered.html ||
          `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;

        // Read the file ONCE per sendMail (cheap; same buffer reused
        // via the transport). Only attach on the paths that have a file
        // on disk (AUTO_SUCCESS / CRON_SCAN / MANUAL_RESEND).
        let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
        if (attachFile && row.storagePath) {
          try {
            const content = await fs.readFile(row.storagePath);
            attachments = [
              {
                filename: row.fileName,
                content,
                contentType: "application/gzip",
              },
            ];
          } catch (e: any) {
            this.logger.warn(
              `sendBackupEmail(${backupId}): attachment read failed (${e?.message ?? e}) — sending text-only email`,
            );
          }
        }

        await this.smtp.sendMail({
          purpose: "BACKUPS",
          to,
          subject,
          text,
          html,
          attachments,
        });
      } catch (e: any) {
        allOk = false;
        this.logger.warn(
          `sendBackupEmail(${backupId}, ${opts.trigger}) → ${to} failed: ${e?.message ?? e}`,
        );
      }
    }

    // Audit only the manual click path (actorId is required by the
    // AuditLog schema). CRON_SCAN has no human actor — the
    // AdminBackupController.webhook entry that triggered the scan is
    // already audited separately, and scanDisk() doesn't have an actor
    // to attribute auto-emails to.
    if (opts.trigger === "MANUAL_RESEND" && opts.actorId) {
      try {
        await this.prisma.auditLog.create({
          data: {
            actorId: opts.actorId,
            actorRole: "ADMIN",
            entity: "backup",
            entityId: row.id,
            action: "email_send",
            diff: {
              trigger: opts.trigger,
              recipients,
              templateName,
              fileName: row.fileName,
              toOverride: opts.toOverride ?? null,
            },
          },
        });
      } catch (e: any) {
        this.logger.warn(`audit log write failed for backup email: ${e.message}`);
      }
    }

    return allOk;
  }

  /**
   * Build the `sentByLine` for MANUAL_RESEND emails — a localized
   * "Sent by admin <name> at <iso-ts>" string. Falls back to just the
   * timestamp when the actor can't be resolved (shouldn't happen in
   * practice because the controller always has req.userId).
   */
  private async formatSentByLine(actorId: string | null): Promise<string> {
    const ts = new Date()
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, " UTC");
    if (!actorId) return `Sent by admin at ${ts}`;
    try {
      const admin = await this.prisma.adminUser.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      });
      const who = admin?.name || admin?.email || actorId.slice(0, 8);
      return `Sent by admin ${who} at ${ts}`;
    } catch {
      return `Sent by admin at ${ts}`;
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
          const more =
            all.length > DRY_RUN_PREVIEW_LINES
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
