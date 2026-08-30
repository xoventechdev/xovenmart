import { Global, Module } from "@nestjs/common";
import { NotificationService } from "./notifications.service";

@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}