import { Module } from "@nestjs/common";
import { AdminBackupController, AdminBackupWebhookController } from "./backup.controller";
import { BackupService } from "./backup.service";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

/**
 * Backup & restore module — admin-only.
 *
 * Two controllers:
 *   - AdminBackupController — JWT-gated routes used by the admin UI.
 *   - AdminBackupWebhookController — token-gated route used by the
 *     nightly OS-cron bash script.
 *
 * The service shells out to `pg_dump` / `pg_restore` (Postgres client
 * tools installed on the VPS). The bash script does NOT need this
 * service for the dump itself — it runs `pg_dump` directly via shell —
 * but it calls our `scanDisk()` so the cron-produced file shows up in
 * the admin UI.
 */
@Module({
  imports: [SharedJwtModule, PrismaModule],
  controllers: [AdminBackupController, AdminBackupWebhookController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
