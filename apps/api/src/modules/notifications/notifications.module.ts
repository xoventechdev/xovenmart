import { Global, Module } from "@nestjs/common";
import { NotificationService } from "./notifications.service";
import { SmtpService } from "./smtp.service";
import { SmtpController } from "./smtp.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

/**
 * Notifications + SMTP — owned by the same folder because SMTP is the
 * mail-delivery primitive that NotificationService.sendEmail() now
 * delegates to.
 *
 * `SmtpService` is exported so other modules can send mail without
 * re-instantiating nodemailer transports.
 *
 * `SharedJwtModule` is required because the admin SMTP controller uses
 * `AuthGuard` / `RolesGuard` / `ManagerGuard` from `shared/jwt/guards`,
 * which depend on `TokenService`.
 */
@Global()
@Module({
  imports: [SharedJwtModule],
  controllers: [SmtpController],
  providers: [NotificationService, SmtpService],
  exports: [NotificationService, SmtpService],
})
export class NotificationsModule {}
