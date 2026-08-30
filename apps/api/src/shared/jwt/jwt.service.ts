import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TokenService } from "./token.service";
import { AuthGuard, RolesGuard } from "./guards";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_ACCESS_TTL_SECONDS", "900") + "s" },
      }),
    }),
  ],
  providers: [TokenService, AuthGuard, RolesGuard],
  exports: [TokenService, JwtModule, AuthGuard, RolesGuard],
})
export class SharedJwtModule {}
