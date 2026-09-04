import { Module } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { SettingsController } from "./settings.controller";
import { DeliveryPublicController } from "./delivery.public.controller";
import { FeatureTogglesPublicController } from "./feature-toggles.public.controller";
import { MaintenancePublicController } from "./maintenance.public.controller";
import { SettingsGeneralPublicController } from "./general.public.controller";
import {
  AdminBrandAssetsController,
  BrandAssetsPublicController,
} from "./brand-assets.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [
    SettingsController,
    DeliveryPublicController,
    FeatureTogglesPublicController,
    MaintenancePublicController,
    SettingsGeneralPublicController,
    AdminBrandAssetsController,
    BrandAssetsPublicController,
  ],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}