import { Module } from "@nestjs/common";
import {
  SitePagesPublicController,
  SitePagesAdminController,
} from "./site-pages.controller";
import { BannersPublicController, BannersAdminController } from "./banners.controller";
import { FaqsPublicController, FaqsAdminController } from "./faqs.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [
    SitePagesPublicController,
    SitePagesAdminController,
    BannersPublicController,
    BannersAdminController,
    FaqsPublicController,
    FaqsAdminController,
  ],
})
export class SitePagesModule {}
