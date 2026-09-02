import { Global, Module } from "@nestjs/common";
import { SecretsService } from "./secrets.service";

/**
 * Global module exposing {@link SecretsService} (AES-256-GCM authenticated
 * encryption for at-rest secrets). `@Global()` so any feature module can
 * inject it without re-importing this module everywhere.
 */
@Global()
@Module({
  providers: [SecretsService],
  exports: [SecretsService],
})
export class CryptoModule {}
