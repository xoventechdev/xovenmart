import { Module } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { SettingsController } from "./settings.controller";
import { DeliveryPublicController } from "./delivery.public.controller";
import { FeatureTogglesPublicController } from "./feature-toggles.public.controller";
import { MaintenancePublicController } from "./maintenance.public.controller";
import { SettingsGeneralPublicController } from "./general.public.controller";
import { AdminBrandAssetsController } from "./brand-assets.controller";
import { MediaStorageService } from "../admin/media-storage.service";
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
  ],
  // `MediaStorageService` is also declared in `AdminModule` — NestJS
  // treats a provider class as a singleton across the whole DI graph
  // (ModuleRef caches by class identity), so declaring it again here
  // just makes it injectable for `AdminBrandAssetsController`. Doing
  // this instead of importing `AdminModule` avoids a Settings↔Admin
  // circular import (`AdminModule` already imports `SettingsModule`
  // because `AdminSettingsController` injects `SettingsService`).
  providers: [SettingsService, MediaStorageService],
  exports: [SettingsService],
})
export class SettingsModule {}