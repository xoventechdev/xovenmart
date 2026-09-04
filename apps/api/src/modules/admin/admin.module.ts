import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminCategoriesController } from "./categories.controller";
import { AdminInventoryController } from "./inventory.controller";
import { AdminCustomersController } from "./customers.controller";
import { AdminRidersController } from "./riders.controller";
import { AdminCouponsController } from "./coupons.controller";
import { AdminDeliveryZonesController } from "./delivery-zones.controller";
import { AdminReportsController } from "./reports.controller";
import { AdminNotificationsController } from "./notifications.controller";
import { AdminPaymentsController } from "./payments.controller";
import { AdminMarketingController } from "./marketing.controller";
import { AdminSupportController } from "./support.controller";
import { AdminMediaController } from "./media.controller";
import { AdminSettingsController } from "./settings.controller";
import { AdminTemplatesController } from "./templates.controller";
import { AdminAuditController } from "./audit.controller";
import { AdminHrController } from "./hr.controller";
import { AdminExpensesController } from "./expenses.controller";
import { AdminTranslationsController } from "./translations.controller";
import { AdminSuppliersController } from "./suppliers.controller";
import { ApiHealthController } from "./api-health.controller";
import { BackupModule } from "./backup.module";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SharedJwtModule, PrismaModule, AuthModule, CatalogModule, BackupModule, SettingsModule],
  controllers: [
    AdminController,
    AdminCategoriesController,
    AdminInventoryController,
    AdminCustomersController,
    AdminRidersController,
    AdminCouponsController,
    AdminDeliveryZonesController,
    AdminReportsController,
    AdminNotificationsController,
    AdminPaymentsController,
    AdminMarketingController,
    AdminSupportController,
    AdminMediaController,
    AdminSettingsController,
    AdminTemplatesController,
    AdminAuditController,
    AdminHrController,
    AdminExpensesController,
    AdminTranslationsController,
    AdminSuppliersController,
    ApiHealthController,
  ],
})
export class AdminModule {}