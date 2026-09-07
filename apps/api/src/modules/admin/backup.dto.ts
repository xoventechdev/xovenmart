import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

/**
 * Query filters for `GET /admin/system/backups`.
 *
 * `status` and `mode` mirror the Prisma enums verbatim so the controller
 * can pass them straight through. Unknown values are rejected by the
 * validation pipe so the API doesn't accept typos.
 */
export class ListBackupsDto {
  @IsOptional()
  @IsIn(["RUNNING", "SUCCESS", "FAILED"])
  status?: "RUNNING" | "SUCCESS" | "FAILED";

  @IsOptional()
  @IsIn(["MANUAL", "SCHEDULED"])
  mode?: "MANUAL" | "SCHEDULED";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}

/**
 * Body for `POST /admin/system/backups/:id/restore`.
 *
 * The first POST (step 1 of the safety dance) returns a dry-run preview
 * — the client shows it to the admin. The admin then POSTs again with
 * `confirm="RESTORE"` to actually execute the restore. Case-sensitive
 * on purpose — accidental lowercase typos won't trigger a destructive
 * op.
 */
export class RestoreBackupDto {
  @IsOptional()
  @IsString()
  @Matches(/^RESTORE$/, {
    message: "Type RESTORE exactly (case-sensitive) to confirm the restore",
  })
  confirm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Body for `POST /admin/system/backups/manual` — the "Backup now"
 * button. Both fields optional; sensible defaults come from the service.
 */
export class ManualBackupDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9\-_.]+$/i, {
    message: "fileName may only contain letters, digits, hyphens, underscores, dots",
  })
  @MaxLength(120)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Body for `PATCH /admin/system/backup-settings`.
 *
 * `retentionDays` is clamped to [1, 365]. `scheduledEnabled` is a soft
 * flag — the OS cron entry in `infra/vps/bootstrap.sh` still runs even
 * when this is false (admin must `sudo crontab -e` to fully disable),
 * but the controller surfaces a clear footnote in the UI.
 */
export class UpdateBackupSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @IsOptional()
  @IsIn([true, false])
  scheduledEnabled?: boolean;
}

/**
 * Body for `POST /admin/system/backups/:id/email`.
 *
 * Optional `to` override — when omitted, the email is sent to every
 * address in BACKUP_NOTIFY_EMAILS / ADMIN_NOTIFY_EMAIL (same recipients
 * as the auto-emailed backup_success / backup_failed alerts). Useful
 * for the "send latest to my email" button on the admin UI: the admin
 * types their own address once, then the next click on the same row
 * defaults to that override.
 *
 * Email format is intentionally permissive (we accept any string the
 * user types) — the SMTP layer will reject malformed addresses on
 * send and we surface the error as a toast. No regex / library here.
 *
 * `notes` is purely for the audit log; it doesn't change the email
 * body (the body template is `template.email.backup_send`).
 */
export class SendBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
