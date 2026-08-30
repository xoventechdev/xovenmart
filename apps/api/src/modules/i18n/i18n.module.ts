import { Module } from "@nestjs/common";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { I18nPublicController } from "./i18n.public.controller";

/**
 * Public i18n endpoints — no auth, no guards.
 * Used by web/admin/Android apps to fetch a translation bundle on launch.
 */
@Module({
  imports: [PrismaModule],
  controllers: [I18nPublicController],
})
export class I18nModule {}