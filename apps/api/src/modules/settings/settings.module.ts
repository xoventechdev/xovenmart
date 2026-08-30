import { Module } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { SettingsController } from "./settings.controller";
import { DeliveryPublicController } from "./delivery.public.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [SettingsController, DeliveryPublicController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}