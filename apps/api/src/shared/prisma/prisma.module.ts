import { Global, Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";

export const PRISMA_CLIENT = "PRISMA_CLIENT";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PRISMA_CLIENT) config: { datasourceUrl: string; logLevel: Prisma.LogLevel[] }) {
    super({
      datasources: { db: { url: config.datasourceUrl } },
      log: config.logLevel,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: (config: ConfigService) => ({
        datasourceUrl: config.getOrThrow<string>("DATABASE_URL"),
        logLevel:
          config.get("NODE_ENV") === "production"
            ? (["error"] as Prisma.LogLevel[])
            : (["query", "warn", "error"] as Prisma.LogLevel[]),
      }),
      inject: [ConfigService],
    },
    PrismaService,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
