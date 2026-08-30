import { Module } from "@nestjs/common";
import { StaffController, PermissionsController } from "./staff.controller";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [StaffController, PermissionsController],
})
export class StaffModule {}
