import { Module } from "@nestjs/common";
import { SeoPublicController, SeoAdminController } from "./seo.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [SeoPublicController, SeoAdminController],
})
export class SeoModule {}