import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CheckoutModule } from "../checkout/checkout.module";

import { BotController } from "./bot.controller";
import { BotCustomerService } from "./bot-customer.service";
import { BotPricingService } from "./bot-pricing.service";
import { BotEventsService } from "./bot-events.service";
import { BotConversationService } from "./bot-conversation.service";
import { BotWebhookGuard } from "./guards/bot-webhook.guard";

/**
 * Bot module.
 *
 * Wires together:
 *   - `SharedJwtModule` for `TokenService` + `AuthGuard` (the
 *     `BOT` JWT audience guard on bot-action endpoints).
 *   - `CatalogModule` so the bot wrappers can reuse the public
 *     `CatalogService.search` / `getProductBySlug` / `calcDeliveryFee`.
 *   - `CheckoutModule` so the bot places orders via the SAME service
 *     the web storefront uses — same validation, same stock decrement,
 *     same SMS / email notifications, same admin dashboard row.
 *   - `HttpModule` (axios) so the webhook receivers can POST events
 *     to n8n's internal ingest endpoint asynchronously without
 *     blocking the webhook 200.
 */
@Module({
  imports: [
    SharedJwtModule,
    PrismaModule,
    CatalogModule,
    CheckoutModule,
    HttpModule,
  ],
  controllers: [BotController],
  providers: [
    BotCustomerService,
    BotPricingService,
    BotEventsService,
    BotConversationService,
    BotWebhookGuard,
  ],
  exports: [
    BotCustomerService,
    BotPricingService,
    BotEventsService,
    BotConversationService,
  ],
})
export class BotModule {}
