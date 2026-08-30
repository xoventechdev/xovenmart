import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
