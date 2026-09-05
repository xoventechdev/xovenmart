import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./shared/prisma/prisma.module";
import { SmsModule } from "./shared/sms/sms.module";
import { CryptoModule } from "./shared/crypto/crypto.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CartModule } from "./modules/cart/cart.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { ReferralsModule } from "./modules/referrals/referrals.module";
import { CouponsModule } from "./modules/coupons/coupons.module";
import { AdminModule } from "./modules/admin/admin.module";
import { RiderModule } from "./modules/rider/rider.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SitePagesModule } from "./modules/site-pages/site-pages.module";
import { SeoModule } from "./modules/seo/seo.module";
import { StaffModule } from "./modules/staff/staff.module";
import { I18nModule } from "./modules/i18n/i18n.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { PosModule } from "./modules/pos/pos.module";
import { NoticesModule } from "./modules/notices/notices.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { HealthController } from "./shared/health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"],
    }),
    ThrottlerModule.forRoot([{
      name: "short",
      ttl: 1000,
      limit: 5,
    }, {
      name: "medium",
      ttl: 60_000,
      limit: 30,
    }, {
      name: "long",
      ttl: 3600_000,
      limit: 500,
    }]),
    PrismaModule,
    SmsModule,
    CryptoModule,
    AuthModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    ReferralsModule,
    CouponsModule,
    AdminModule,
    RiderModule,
    SettingsModule,
    SitePagesModule,
    SeoModule,
    StaffModule,
    I18nModule,
    CustomersModule,
    PosModule,
    NoticesModule,
    TemplatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
