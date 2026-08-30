import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";

@Module({
  imports: [SharedJwtModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
