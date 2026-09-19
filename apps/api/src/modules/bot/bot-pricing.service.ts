import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { CatalogService } from "../catalog/catalog.service";
import { CheckoutService } from "../checkout/checkout.service";
import { CheckoutDto, AddressDto } from "../checkout/dto";
import {
  BotProductCard,
  BotProductDetail,
  BotVariantCard,
  BotPlaceOrderDto,
  BotChannel,
} from "./dto/bot-actions.dto";

/**
 * Catalog + order-placement surface for the bot module.
 *
 * Wraps the existing `CatalogService` and `CheckoutService` so the
 * bot's responses are compact (a chat reply can't show 50 image
 * variants), and so the bot can place orders via the same code path
 * the web storefront uses — every bot-placed order gets the same
 * stock decrement, the same SMS, the same admin dashboard row.
 */
@Injectable()
export class BotPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly checkout: CheckoutService,
  ) {}

  /**
   * Compact search results for autocomplete-style "which product?"
   * prompts. Caps at 5 hits and returns only the fields the bot needs
   * for a price reply.
   *
   * Also honors `Product.botVisible` (defaults true) — admin can
   * hide individual products from the bot without unpublishing them
   * from the web storefront. See `Product.botVisible` in the schema.
   */
  async search(query: string, limit: number): Promise<BotProductCard[]> {
    const lim = Math.min(Math.max(1, Number(limit) || 5), 5);
    const raw = await this.catalog.search({ q: query, limit: lim } as any);
    // CatalogService.search returns { results: [...] }
    const items: any[] = Array.isArray(raw?.results) ? raw.results : [];
    const out: BotProductCard[] = [];
    for (const p of items) {
      // Admin can mark a product as bot-hidden. Cheap check at the
      // application layer (vs. a Prisma where: { botVisible: true })
      // because the catalog service doesn't accept that filter and
      // wrapping it here keeps the search hot path untouched.
      if (p.botVisible === false) continue;
      out.push(this.toCard(p));
    }
    return out;
  }

  /**
   * Full detail for "what's the price of X?" with variants so the
   * bot can offer a size picker.
   */
  async productBySlug(slug: string): Promise<BotProductDetail> {
    const p = await this.catalog.getProductBySlug(slug);
    if (!p) {
      throw new BadRequestException("Product not found");
    }
    if ((p as any).botVisible === false) {
      // Same as not-found for the bot — don't leak the existence of
      // admin-hidden items.
      throw new BadRequestException("Product not found");
    }
    const variants: BotVariantCard[] | undefined = Array.isArray(
      (p as any).variants,
    )
      ? (p as any).variants.map((v: any) => ({
          id: v.id,
          name: v.name,
          priceSale: Number(v.priceSale ?? 0),
          inStock: v.inStock === true,
        }))
      : undefined;
    return {
      slug: (p as any).slug,
      nameBn: (p as any).nameBn ?? "",
      nameEn: (p as any).nameEn ?? "",
      salePrice: Number((p as any).salePrice ?? 0),
      mrp: Number((p as any).mrp ?? 0),
      inStock: (p as any).inStock !== false,
      variants,
      unit: (p as any).unit,
    };
  }

  /**
   * Delivery-fee wrapper. Accepts the bot's `lat`/`lng` + `subtotal`
   * and returns the same shape `/catalog/delivery-fee` returns.
   */
  async quoteDelivery(lat: number, lng: number, subtotal: number) {
    return this.catalog.calcDeliveryFee(lat, lng, subtotal);
  }

  /**
   * Place an order from the bot's conversational cart.
   *
   * Strategy: build a `CheckoutDto` and call `CheckoutService.place`
   * internally. We synthesize a `Request`-like object with `userId`
   * undefined and `role = undefined` so the checkout service treats
   * this as a guest checkout (which is what bot customers are until
   * they self-register).
   *
   * Idempotency: the caller MUST pass a unique `idempotencyKey`. We
   * store the (key → orderId) mapping in `BotIdempotency` and short-
   * circuit if the same key is replayed (e.g. Green API double-fire).
   *
   * Cost guardrail: `bot.maxTurnsPerSession` (default 20) blocks orders
   * that come after a long conversation — forces the bot to hand off
   * to a human before the per-conversation LLM/WhatsApp bill grows
   * unbounded.
   */
  async placeOrder(
    dto: BotPlaceOrderDto,
    session: {
      senderId: string;
      channel: BotChannel;
      conversationId?: string;
      turnCount: number;
    },
  ): Promise<{
    ok: true;
    order: {
      id: string;
      orderNo: string;
      status: string;
      totals: {
        subtotal: number;
        deliveryFee: number;
        grandTotal: number;
      };
    };
    idempotent: boolean;
    conversationTurnCount: number;
  }> {
    // ── 1. Idempotency ────────────────────────────────────────────
    const existing = await this.prisma.botIdempotency.findUnique({
      where: { key: dto.idempotencyKey },
      include: { order: true },
    });
    if (existing?.order) {
      // Replay — return the original order so the caller (n8n) doesn't
      // double-send a confirmation message.
      return {
        ok: true,
        idempotent: true,
        order: {
          id: existing.order.id,
          orderNo: existing.order.orderNo,
          status: existing.order.status,
          totals: {
            subtotal: Number(existing.order.subtotal),
            deliveryFee: Number(existing.order.deliveryFee),
            grandTotal: Number(existing.order.grandTotal),
          },
        },
        conversationTurnCount: session.turnCount,
      };
    }

    // ── 2. Cost guardrail ─────────────────────────────────────────
    const settings = (await this.prisma.appSetting.findUnique({
      where: { key: "bot.maxTurnsPerSession" },
    })) as any;
    const maxTurns = Number(settings?.value ?? 20);
    if (session.turnCount > maxTurns) {
      throw new BadRequestException(
        `Conversation exceeded maxTurnsPerSession (${maxTurns}). Please handoff to a human.`,
      );
    }

    // ── 3. Build the CheckoutDto ─────────────────────────────────
    const checkoutDto: CheckoutDto = {
      guestPhone: dto.phone,
      guestName: dto.name || this.defaultNameForChannel(dto.channel),
      address: {
        fullText: dto.address.fullText,
        lat: dto.address.lat,
        lng: dto.address.lng,
        landmark: dto.address.landmark,
      } as AddressDto,
      items: dto.items.map((it) => ({
        productId: it.productId,
        qty: it.qty,
        variantId: it.variantId ?? null,
      })),
      couponCode: dto.couponCode,
      paymentMethod: "COD",
      notes: dto.notes,
      source: dto.channel as any, // OrderSource enum widened in migration
    };

    // Synthesize a guest-style Request. `req.userId` and `req.role`
    // are absent, so CheckoutService.place follows the guest branch
    // and does the best-effort phone → user link internally.
    const fakeReq = {
      userId: undefined,
      role: undefined,
      ip: "bot",
      headers: {},
    } as any;

    const placed: any = await this.checkout.place(checkoutDto, fakeReq);
    const order = placed?.order ?? placed;

    // ── 4. Stamp the bot identity on the order + persist idempotency
    // We do this AFTER placement because the checkout service does
    // its own product/stock/coupon validation in one transaction. If
    // we set these columns up-front and the placement fails, we'd
    // have to roll back; doing it after keeps the transaction tight.
    if (order?.id) {
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: {
            botChannel: dto.channel,
            botSenderId: dto.senderId,
            botConversationId: dto.conversationId ?? null,
          },
        }),
        this.prisma.botIdempotency.create({
          data: {
            key: dto.idempotencyKey,
            channel: dto.channel,
            senderId: dto.senderId,
            orderId: order.id,
          },
        }),
      ]);
    }

    return {
      ok: true,
      idempotent: false,
      order: {
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
        totals: {
          subtotal: Number(order.subtotal ?? order.totals?.subtotal ?? 0),
          deliveryFee: Number(order.deliveryFee ?? order.totals?.deliveryFee ?? 0),
          grandTotal: Number(order.grandTotal ?? order.totals?.grandTotal ?? 0),
        },
      },
      conversationTurnCount: session.turnCount,
    };
  }

  /**
   * Default guest name per channel. Used when the bot places an order
   * but didn't ask the customer's name (Messenger PSIDs and WhatsApp
   * numbers don't carry names without an extra Graph API call).
   */
  private defaultNameForChannel(channel: BotChannel): string {
    switch (channel) {
      case BotChannel.MESSENGER: return "Messenger Customer";
      case BotChannel.WHATSAPP_CLOUD: return "WhatsApp Customer";
      case BotChannel.WHATSAPP_GREEN: return "WhatsApp Customer";
    }
  }

  /**
   * Catalog row → compact card.
   *
   * Search returns `{price, mrp}`; getProductBySlug returns
   * `{salePrice, mrp}`. Accept both so this works for both call sites.
   */
  private toCard(p: any): BotProductCard {
    return {
      slug: p.slug,
      nameBn: p.nameBn ?? "",
      nameEn: p.nameEn ?? "",
      salePrice: Number(p.salePrice ?? p.price ?? 0),
      mrp: Number(p.mrp ?? 0),
      inStock: p.inStock !== false,
    };
  }
}
