import { Module } from "@nestjs/common";
import { CheckoutService } from "./checkout.service";
import { CheckoutController } from "./checkout.controller";
import { CatalogModule } from "../catalog/catalog.module";

/**
 * The bot module reuses `CheckoutService.place()` to place orders on
 * the chat-bot's behalf — same validation, same stock decrement, same
 * notifications as the web storefront. That requires this module to
 * `exports: [CheckoutService]` so other modules can inject it.
 */
@Module({
  imports: [CatalogModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}