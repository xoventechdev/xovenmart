import { Module } from "@nestjs/common";
import { SharedJwtModule } from "../../shared/jwt/jwt.service";
import { PrismaModule } from "../../shared/prisma/prisma.module";
import { CryptoModule } from "../../shared/crypto/crypto.module";
import { AiAdminController } from "./ai-admin.controller";
import { AiProvidersController } from "./ai-providers.controller";
import { AiService } from "./ai.service";

/**
 * Wires the AI providers CRUD + generation runtime.
 *
 * `PrismaModule` is global, so we don't import it — but we list it
 * for explicitness so a future refactor that removes the `@Global()`
 * doesn't silently break us.
 *
 * `CryptoModule` provides `SecretsService` which `AiService` uses to
 * encrypt / decrypt provider API keys at rest.
 */
@Module({
  imports: [SharedJwtModule, PrismaModule, CryptoModule],
  controllers: [AiProvidersController, AiAdminController],
  providers: [AiService],
})
export class AiModule {}
