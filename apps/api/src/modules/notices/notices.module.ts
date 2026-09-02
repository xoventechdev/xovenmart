import { Module } from "@nestjs/common";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { NoticesPublicController } from "./notices.public.controller";

@Module({
  imports: [PrismaModule],
  controllers: [NoticesPublicController],
})
export class NoticesModule {}
