import { Module } from "@nestjs/common";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";
import { CatalogModule } from "../catalog/catalog.module";
import { PosController } from "./pos.controller";
import { PosService } from "./pos.service";

@Module({
  imports: [SharedJwtModule, CatalogModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
