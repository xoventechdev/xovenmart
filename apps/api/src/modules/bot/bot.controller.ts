import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

import { AuthGuard, Audience } from "../../shared/jwt/guards";
import { JwtAudience } from "../../shared/jwt/token.service";
import { BotWebhookGuard } from "./guards/bot-webhook.guard";

import { BotCustomerService } from "./bot-customer.service";
import { BotPricingService } from "./bot-pricing.service";
import { BotEventsService } from "./bot-events.service";
import { BotConversationService } from "./bot-conversation.service";
import {
  BotPlaceOrderDto,
  BotChannel,
} from "./dto/bot-actions.dto";

/**
 * Top-level controller for everything bot-related.
 *
 * Three routing zones:
 *
 *   1. `/bot/webhooks/<channel>` — provider callbacks. NO JWT.
 *      Guarded by `BotWebhookGuard` (HMAC for Meta, query-param
 *      token for Green API). Always 200s fast and forwards to n8n.
 *
 *   2. `/bot/auth/rotate` — admin-only. Mints a fresh service JWT
 *      and writes it to the `AppSetting` table under
 *      `bot.serviceToken` so n8n can read it via Config Source.
 *
 *   3. `/bot/<resource>/*` — bot-action endpoints. Guarded by
 *      `AuthGuard` with `@Audience(JwtAudience.BOT)` — n8n presents
 *      the service token in `Authorization: Bearer <N8N_BOT_SERVICE_TOKEN>`.
 *      These are the read + write endpoints the n8n workflow uses.
 */
@ApiTags("bot")
@Controller("bot")
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(
    private readonly customer: BotCustomerService,
    private readonly pricing: BotPricingService,
    private readonly events: BotEventsService,
    private readonly conversation: BotConversationService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  // ════════════════════════════════════════════════════════════════
  // SECTION 1 — WEBHOOK RECEIVERS (no JWT, signature-verified)
  // ════════════════════════════════════════════════════════════════

  /**
   * Meta verification handshake. Meta sends
   *   GET /bot/webhooks/messenger?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
   * We echo `hub.challenge` if the verify_token matches.
   *
   * The same endpoint serves Messenger AND WhatsApp Cloud — both use
   * `hub.mode`/`hub.verify_token`/`hub.challenge`. We branch on path
   * to pick the right env var.
   */
  @Get("webhooks/messenger")
  @UseGuards(BotWebhookGuard)
  verifyMessenger(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ) {
    return this.handleMetaVerify(
      BotChannel.MESSENGER,
      mode,
      token,
      challenge,
      res,
    );
  }

  @Get("webhooks/whatsapp-cloud")
  @UseGuards(BotWebhookGuard)
  verifyWhatsAppCloud(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ) {
    return this.handleMetaVerify(
      BotChannel.WHATSAPP_CLOUD,
      mode,
      token,
      challenge,
      res,
    );
  }

  private handleMetaVerify(
    channel: BotChannel,
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    res: Response,
  ) {
    const expected = this.config.get<string>("META_VERIFY_TOKEN");
    if (mode !== "subscribe" || !token || token !== expected) {
      this.logger.warn(`Meta verify failed channel=${channel} mode=${mode}`);
      // Per Meta docs, return 403 on bad verify_token. They treat
      // any non-200 as "webhook not configured" and retry.
      return res.status(403).send("Forbidden");
    }
    return res.status(200).send(challenge ?? "");
  }

  /**
   * Messenger inbound events. Meta POSTs the full conversation
   * envelope (messaging array, sender PSID, text, attachments...).
   * We:
   *   1. Forward the normalized envelope to n8n.
   *   2. Log the inbound event to `BotEvent`.
   *   3. Bump the conversation turn count.
   *   4. Always return 200 (Meta retries on non-200).
   */
  @Post("webhooks/messenger")
  @HttpCode(200)
  @UseGuards(BotWebhookGuard)
  async receiveMessenger(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ) {
    return this.receiveMeta(req, res, BotChannel.MESSENGER);
  }

  @Post("webhooks/whatsapp-cloud")
  @HttpCode(200)
  @UseGuards(BotWebhookGuard)
  async receiveWhatsAppCloud(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ) {
    return this.receiveMeta(req, res, BotChannel.WHATSAPP_CLOUD);
  }

  private async receiveMeta(
    req: Request & { rawBody?: Buffer },
    res: Response,
    channel: BotChannel,
  ) {
    // Meta may send multiple entries per webhook (fan-out). Process
    // each independently so a malformed entry doesn't drop the whole
    // batch.
    let body: any = {};
    try {
      body = JSON.parse((req.rawBody ?? Buffer.from("")).toString("utf8"));
    } catch (e) {
      this.logger.warn(`bad JSON on ${channel} webhook`);
      return res.status(200).send("OK");
    }

    const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const events: any[] = Array.isArray(entry?.messaging)
        ? entry.messaging
        : [];
      for (const ev of events) {
        const senderId: string | undefined = ev?.sender?.id;
        const text: string = ev?.message?.text ?? "";
        const messageId: string | undefined = ev?.message?.mid;
        if (!senderId || !text) continue;

        // Best-effort phone extraction. Messenger PSIDs aren't
        // phone numbers — to get a phone, the bot must call the
        // customer-profile endpoint. We leave customerPhone null for
        // Messenger; the bot will ask if it needs it.
        const customerPhone = ev?.message?.phone_number ?? undefined;

        await this.events.logInbound({
          channel,
          senderId,
          customerPhone,
          messageId,
          payload: ev,
          status: "OK",
        });

        // Forward to n8n — n8n does all the orchestration (catalog
        // lookup, reply formatting, order placement). The API is
        // intentionally dumb here: webhook in, normalize, forward.
        await this.forwardToN8n({
          channel,
          senderId,
          messageText: text,
          customerPhone,
          timestamp: String(ev?.timestamp ?? Date.now()),
          rawProviderPayload: ev,
        });

        // Bump the conversation state. n8n reads the new turnCount
        // on its next call to /bot/conversation/:senderId.
        try {
          await this.conversation.touch({ channel, senderId });
        } catch {
          /* never block the webhook on state writes */
        }
      }
    }

    return res.status(200).send("OK");
  }

  /**
   * WhatsApp via Green API. Different shape: a single notification
   * object per POST, no `entry[]` wrapping.
   */
  @Post("webhooks/whatsapp-green")
  @HttpCode(200)
  @UseGuards(BotWebhookGuard)
  async receiveGreenApi(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ) {
    let body: any = {};
    try {
      body = JSON.parse((req.rawBody ?? Buffer.from("")).toString("utf8"));
    } catch (e) {
      this.logger.warn("bad JSON on green webhook");
      return res.status(200).send("OK");
    }

    const senderId = body?.sender?.chatId ?? body?.from ?? body?.chatId;
    const text =
      body?.messageData?.textMessageData?.textMessage ??
      body?.message ??
      body?.text ??
      "";
    const messageId = body?.idMessage ?? body?.messageId ?? body?.id;
    const customerPhone = extractGreenApiPhone(senderId);

    if (!senderId || !text) {
      return res.status(200).send("OK");
    }

    await this.events.logInbound({
      channel: BotChannel.WHATSAPP_GREEN,
      senderId: String(senderId),
      customerPhone,
      messageId: messageId ? String(messageId) : undefined,
      payload: body,
      status: "OK",
    });

    await this.forwardToN8n({
      channel: BotChannel.WHATSAPP_GREEN,
      senderId: String(senderId),
      messageText: String(text),
      customerPhone,
      timestamp: String(body?.timestamp ?? Date.now()),
      rawProviderPayload: body,
    });

    try {
      await this.conversation.touch({
        channel: BotChannel.WHATSAPP_GREEN,
        senderId: String(senderId),
      });
    } catch {
      /* noop */
    }

    return res.status(200).send("OK");
  }

  /**
   * Forward a normalized envelope to n8n. We POST asynchronously and
   * don't block the webhook — if n8n is down, the webhook still 200s
   * and Meta stops retrying. The BotEvent row we logged is the audit
   * trail for any dropped event.
   */
  private async forwardToN8n(envelope: {
    channel: BotChannel;
    senderId: string;
    messageText: string;
    customerPhone?: string;
    timestamp: string;
    rawProviderPayload: unknown;
  }) {
    const ingestUrl = this.config.get<string>("N8N_INTERNAL_INGEST_URL");
    const ingestSecret = this.config.get<string>("N8N_INGEST_SECRET");
    if (!ingestUrl || !ingestSecret) {
      this.logger.warn(
        "N8N_INTERNAL_INGEST_URL not set — bot will not respond. " +
          "Set it in .env to enable the bot.",
      );
      return;
    }
    try {
      // Fire-and-forget but with a short timeout so a slow n8n
      // doesn't pin resources.
      await firstValueFrom(
        this.http.post(`${ingestUrl.replace(/\/$/, "")}/bot-ingest`, envelope, {
          headers: {
            "content-type": "application/json",
            "x-internal-secret": ingestSecret,
          },
          timeout: 5_000,
          // Avoid throwing on non-2xx — we don't want a 4xx from
          // n8n to bubble up and break the webhook 200.
          validateStatus: () => true,
        }),
      );
    } catch (e) {
      this.logger.warn(
        `failed to forward to n8n channel=${envelope.channel} sender=${envelope.senderId}: ${(e as Error).message}`,
      );
    }
  }

  // ════════════════════════════════════════════════════════════════
  // SECTION 2 — BOT-ACTION ENDPOINTS (require BOT JWT)
  // ════════════════════════════════════════════════════════════════

  /**
   * Look up an existing customer by phone. Read-only.
   */
  @Get("customer/lookup")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Look up a customer by canonical Bangladesh phone. Read-only — never creates an account.",
  })
  async lookupCustomer(@Query("phone") phone: string) {
    if (!phone) throw new BadRequestException("phone query param required");
    return this.customer.lookupByPhone(phone);
  }

  /**
   * Search products for the bot.
   */
  @Get("catalog/search")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Search products (compact shape for chat replies)" })
  async searchCatalog(
    @Query("q") q: string,
    @Query("limit") limit?: string,
  ) {
    if (!q) throw new BadRequestException("q query param required");
    return this.pricing.search(q, Number(limit ?? 5));
  }

  @Get("catalog/product/:slug")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get product detail with variants" })
  async productDetail(@Param("slug") slug: string) {
    return this.pricing.productBySlug(slug);
  }

  @Get("delivery/quote")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Quote delivery fee for a lat/lng + subtotal" })
  async quote(
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("subtotal") subtotal: string,
  ) {
    return this.pricing.quoteDelivery(Number(lat), Number(lng), Number(subtotal));
  }

  /**
   * Place an order. Idempotent on `idempotencyKey`.
   */
  @Post("orders/place")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Place an order from the bot's conversational cart. Idempotent on `idempotencyKey`.",
  })
  async placeOrder(@Body() dto: BotPlaceOrderDto) {
    // We need the conversation turnCount for the cost guardrail.
    // Fetch it; if no conversation row exists yet (first message in
    // this channel), treat turnCount = 1.
    const state = await this.conversation.get(dto.channel, dto.senderId);
    return this.pricing.placeOrder(dto, {
      senderId: dto.senderId,
      channel: dto.channel,
      conversationId: dto.conversationId,
      turnCount: state.turnCount || 1,
    });
  }

  @Get("conversation/:senderId")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  async getConversation(
    @Param("senderId") senderId: string,
    @Query("channel") channel: BotChannel,
  ) {
    if (!channel) throw new BadRequestException("channel query param required");
    const state = await this.conversation.get(channel, senderId);
    const events = await this.events.recentForSender(channel, senderId, 20);
    return { ...state, events };
  }

  @Post("conversation/:senderId/touch")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  async touchConversation(
    @Param("senderId") senderId: string,
    @Body() body: { channel: BotChannel },
  ) {
    if (!body?.channel) throw new BadRequestException("channel required in body");
    return this.conversation.touch({ channel: body.channel, senderId });
  }

  @Post("conversation/:senderId/handoff")
  @UseGuards(AuthGuard)
  @Audience(JwtAudience.BOT)
  @ApiBearerAuth()
  async handoffConversation(
    @Param("senderId") senderId: string,
    @Body() body: { channel: BotChannel },
  ) {
    if (!body?.channel) throw new BadRequestException("channel required in body");
    return this.conversation.handoff(body.channel, senderId);
  }
}

/**
 * Green API chatId looks like "<phone>@c.us" (similar to WhatsApp Web's
 * internal id). Extract just the phone so we can match against
 * `User.phone`.
 */
function extractGreenApiPhone(chatId: string | undefined): string | undefined {
  if (!chatId) return undefined;
  const m = String(chatId).match(/^(\d+)/);
  if (!m) return undefined;
  // chatId is usually international format (e.g. 8801720694513).
  // We don't normalize here — BotCustomerService.lookupByPhone runs
  // the canonical normalizer.
  return m[1];
}
