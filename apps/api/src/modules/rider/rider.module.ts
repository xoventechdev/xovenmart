import { Module } from "@nestjs/common";
import { RiderController } from "./rider.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [RiderController],
})
export class RiderModule {}