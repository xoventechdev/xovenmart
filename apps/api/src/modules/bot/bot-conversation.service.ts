import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { BotChannel } from "./dto/bot-actions.dto";

/**
 * Conversation state for the bot module.
 *
 * The actual conversation turns live in the `BotEvent` table (full
 * payloads); this service tracks lightweight derived state — turn
 * count, handoff status — that the bot checks on every incoming
 * message to decide what to do (continue, handoff to human, etc.).
 *
 * Turn count is the cost guardrail: once a customer has sent > N
 * messages, the bot stops trying to help and tells them to message
 * an admin. n8n reads `turnCount` from the response of
 * `POST /bot/conversation/:senderId/touch` and gates subsequent
 * `place_order` calls on it.
 */
@Injectable()
export class BotConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bump the turn count for a (channel, senderId). Returns the new
   * count + whether the conversation has been handed off + the
   * configured maxTurnsPerSession so the bot can short-circuit.
   */
  async touch(args: {
    channel: BotChannel;
    senderId: string;
    handoff?: boolean;
  }): Promise<{
    turnCount: number;
    handedOff: boolean;
    maxTurns: number;
  }> {
    const maxTurnsRow = (await this.prisma.appSetting.findUnique({
      where: { key: "bot.maxTurnsPerSession" },
    })) as any;
    const maxTurns = Number(maxTurnsRow?.value ?? 20);

    // Use upsert + atomic increment so concurrent webhooks don't
    // lose a turn. The handoff flag is sticky — once set, it stays
    // set until the admin manually clears it.
    const updated = await this.prisma.botConversation.upsert({
      where: {
        channel_senderId: {
          channel: args.channel,
          senderId: args.senderId,
        },
      },
      create: {
        channel: args.channel,
        senderId: args.senderId,
        turnCount: 1,
        handedOff: args.handoff === true,
      },
      update: {
        turnCount: { increment: 1 },
        ...(args.handoff === true ? { handedOff: true } : {}),
      },
    });

    return {
      turnCount: updated.turnCount,
      handedOff: updated.handedOff,
      maxTurns,
    };
  }

  /**
   * Read-only snapshot. Used by `/bot/conversation/:senderId` so n8n
   * can recover state after a workflow restart.
   */
  async get(channel: BotChannel, senderId: string) {
    const row = await this.prisma.botConversation.findUnique({
      where: {
        channel_senderId: { channel, senderId },
      },
    });
    const maxTurnsRow = (await this.prisma.appSetting.findUnique({
      where: { key: "bot.maxTurnsPerSession" },
    })) as any;
    const maxTurns = Number(maxTurnsRow?.value ?? 20);
    return {
      turnCount: row?.turnCount ?? 0,
      handedOff: row?.handedOff ?? false,
      lastSeenAt: row?.lastSeenAt ?? null,
      maxTurns,
    };
  }

  /**
   * Mark a conversation as handed off. Subsequent bot replies to the
   * customer should direct them to a human (admin phone from
   * `general.contact.phoneDisplay`).
   */
  async handoff(channel: BotChannel, senderId: string) {
    await this.prisma.botConversation.upsert({
      where: {
        channel_senderId: { channel, senderId },
      },
      create: {
        channel,
        senderId,
        turnCount: 0,
        handedOff: true,
      },
      update: { handedOff: true },
    });
    return { handedOff: true };
  }
}
