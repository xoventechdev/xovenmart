import { Module } from "@nestjs/common";
import { CheckoutService } from "./checkout.service";
import { CheckoutController } from "./checkout.controller";
import { CatalogModule } from "../catalog/catalog.module";

@Module({
  imports: [CatalogModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}