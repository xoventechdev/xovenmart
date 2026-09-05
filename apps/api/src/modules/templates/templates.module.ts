import { Global, Module } from "@nestjs/common";
import { TemplatesService } from "./templates.service";

/**
 * TemplatesModule — single source of truth for every notification
 * template (email, SMS, push). Registered `@Global` so any other module
 * (notifications, auth, checkout, backup, admin) can inject
 * `TemplatesService` without an import edge.
 *
 * Depends only on `PrismaService` (also `@Global`) so no circular
 * dependency risk with `NotificationsModule`.
 */
@Global()
@Module({
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
