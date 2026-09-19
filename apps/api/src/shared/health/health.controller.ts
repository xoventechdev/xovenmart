import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.module";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Liveness probe" })
  health() {
    return { status: "ok", service: "xovenmart-api", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe (checks DB connectivity)" })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", db: "ok", timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: "not_ready", db: "error", timestamp: new Date().toISOString() };
    }
  }

  /**
   * Schema-introspection diagnostic. Returns which bot-related columns
   * and tables actually exist in the prod DB, plus the recent rows of
   * `_prisma_migrations`. Use this to triage "catalog 500 — is the
   * migration applied?" without SSHing into the VPS.
   *
   * Not gated by auth — exposes only metadata about table/column
   * presence, no row data.
   */
  @Get("schema")
  @ApiOperation({ summary: "DB schema diagnostic (bot migrations + tables)" })
  async schema() {
    const result: Record<string, unknown> = {};

    // Column presence checks. `to_regclass` returns NULL when the
    // table/column doesn't exist; we cast to text so the response is
    // always JSON-serializable.
    const colChecks = await this.prisma.$queryRaw<
      Array<{ check: string; present: boolean }>
    >`
      SELECT check, present FROM (
        SELECT
          'products.bot_visible' AS check,
          EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'products'
              AND column_name = 'bot_visible'
          ) AS present
        UNION ALL SELECT 'orders.bot_channel',
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='bot_channel')
        UNION ALL SELECT 'orders.bot_sender_id',
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='bot_sender_id')
        UNION ALL SELECT 'orders.bot_conversation_id',
          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='bot_conversation_id')
        UNION ALL SELECT 'table bot_events',
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bot_events')
        UNION ALL SELECT 'table bot_idempotency',
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bot_idempotency')
        UNION ALL SELECT 'table bot_conversations',
          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bot_conversations')
      ) s
      ORDER BY check
    `;
    result.columns = colChecks;

    // Enum value check on order_source.
    const enumVals = await this.prisma.$queryRaw<Array<{ unnest: string }>>`
      SELECT unnest(enum_range(NULL::"order_source"))::text AS unnest
    `;
    result.orderSourceValues = enumVals.map((r) => r.unnest);

    // Recent migrations. Filter to the bot-related ones so the
    // response stays small.
    const migrations = await this.prisma.$queryRaw<
      Array<{
        migration_name: string;
        finished_at: Date | null;
        applied_steps_count: number | null;
        started_at: Date;
      }>
    >`
      SELECT migration_name, finished_at, applied_steps_count, started_at
      FROM _prisma_migrations
      WHERE migration_name LIKE '20250919%' OR migration_name LIKE '%bot%'
      ORDER BY started_at DESC
      LIMIT 20
    `;
    result.recentBotMigrations = migrations;

    return result;
  }
}
