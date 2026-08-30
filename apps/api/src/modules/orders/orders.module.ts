import { Module } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { OrdersController } from "./orders.controller";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReferralsModule } from "../referrals/referrals.module";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule, NotificationsModule, ReferralsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}