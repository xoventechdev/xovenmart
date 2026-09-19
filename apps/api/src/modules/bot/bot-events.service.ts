import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { BotChannel } from "./dto/bot-actions.dto";

/**
 * Append-only event log for the bot module.
 *
 * Every webhook receive + every bot-action appends a row. Used for:
 *   1. Conversation history (`GET /bot/conversation/:senderId`) so
 *      the bot can resume context across n8n workflow restarts.
 *   2. Debugging — when a customer reports a bad bot reply, we can
 *      query their senderId and see every event leading up to it.
 *   3. Audit trail — required for the WhatsApp Cloud 24h session
 *      tracking (Meta forbids business-initiated messages outside
 *      the 24h window, so we need to know when each customer last
 *      wrote in).
 *
 * Schema lives in `packages/db/prisma/schema.prisma` as `BotEvent`.
 */
@Injectable()
export class BotEventsService {
  private readonly logger = new Logger(BotEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an inbound event (customer → bot). Idempotent on
   * (channel, senderId, direction, messageId) so Meta's webhook
   * retries don't double-log.
   */
  async logInbound(args: {
    channel: BotChannel;
    senderId: string;
    customerPhone?: string;
    messageId?: string;
    payload: unknown;
    status?: "OK" | "ERROR" | "HANDOFF";
    errorMessage?: string;
  }) {
    try {
      const row = await this.prisma.botEvent.create({
        data: {
          channel: args.channel,
          senderId: args.senderId,
          customerPhone: args.customerPhone ?? null,
          direction: "INBOUND",
          payload: args.payload as any,
          status: args.status ?? "OK",
          errorMessage: args.errorMessage ?? null,
          messageId: args.messageId ?? null,
        },
      });
      return row;
    } catch (e) {
      // Logging itself must never break the webhook. Worst case we
      // miss one event row but the user message still gets handled.
      this.logger.warn(
        `failed to log inbound bot event channel=${args.channel} sender=${args.senderId}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Append an outbound event (bot → customer).
   */
  async logOutbound(args: {
    channel: BotChannel;
    senderId: string;
    payload: unknown;
    status?: "OK" | "ERROR";
    errorMessage?: string;
  }) {
    try {
      return await this.prisma.botEvent.create({
        data: {
          channel: args.channel,
          senderId: args.senderId,
          direction: "OUTBOUND",
          payload: args.payload as any,
          status: args.status ?? "OK",
          errorMessage: args.errorMessage ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(
        `failed to log outbound bot event channel=${args.channel} sender=${args.senderId}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Last N events for a sender, ordered newest-first. Used by
   * `/bot/conversation/:senderId`.
   */
  async recentForSender(
    channel: BotChannel,
    senderId: string,
    limit = 20,
  ): Promise<any[]> {
    return this.prisma.botEvent.findMany({
      where: { channel, senderId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 100),
    });
  }
}
