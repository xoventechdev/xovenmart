# Bot module (n8n messaging integration — Phase 1)

This module exposes the API surface that the n8n orchestrator (and any future
chat-bot backend) uses to:

1. Receive webhooks from Facebook Messenger, WhatsApp Cloud API, and
   WhatsApp via Green API.
2. Look up product prices / availability / variants for the bot's "what's the
   price of X?" replies.
3. Quote delivery fees for the customer's location.
4. Place COD orders on the customer's behalf, with idempotency.
5. Track conversation state (turn count for cost guardrail, handoff flag).

The bot places orders through the SAME `CheckoutService.place` that the web
storefront uses — same validation, same stock decrement, same SMS / email
notifications, same admin dashboard row.

## Channel integrations — operator setup

### Facebook Messenger (first channel shipped)

1. Create a Meta App at <https://developers.facebook.com/> → add product
   "Messenger".
2. Link the app to your Facebook Page; generate a Page Access Token
   (`META_PAGE_ACCESS_TOKEN`).
3. App Settings → Basic → copy "App Secret" → `META_APP_SECRET`.
4. Pick a random string for `META_VERIFY_TOKEN` (e.g.
   `openssl rand -hex 24`).
5. In the Meta App's Webhooks section, set the callback URL to:
   - `https://app.xovenmart.com/api/v1/bot/webhooks/messenger`
   (we front the API through the existing `xovenmart.com` Caddy block —
   add an `@api path /api/*` matcher that proxies to `api:3001` if not
   already there)
   Verify token = the `META_VERIFY_TOKEN` value from step 4.
   Subscribe to: `messages`, `messaging_postbacks`.
6. In n8n (Phase 2 of the plan), import the `messenger-inbound.json`
   workflow from `apps/n8n-workflows/`.

### WhatsApp Cloud API (later phase)

1. Meta Business verification at business.facebook.com.
2. Create a WhatsApp App + Business phone number.
3. Copy: `WHATSAPP_CLOUD_PHONE_ID`, `WHATSAPP_CLOUD_TOKEN`.
4. Set the same `META_APP_SECRET` / `META_VERIFY_TOKEN` (Meta uses the
   same App Secret for both products).
5. Webhook URL: `https://app.xovenmart.com/api/v1/bot/webhooks/whatsapp-cloud`.
6. n8n workflow: `whatsapp-cloud-inbound.json`.

### WhatsApp via Green API (later phase, unofficial)

> ⚠️ Green API is unofficial. Meta can ban personal numbers used this way.
> The user accepts this risk; document it in operator onboarding.

1. Create an account at <https://green-api.com/> and scan the QR with your
   personal WhatsApp.
2. Copy: `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`.
3. Set the webhook URL in the Green API panel to
   `https://app.xovenmart.com/api/v1/bot/webhooks/whatsapp-green?token=$GREEN_API_TOKEN`.
4. n8n workflow: `whatsapp-green-inbound.json`.

## Auth

### Outbound (n8n → API)

n8n sends requests to `/api/v1/bot/*` (except webhooks) with
`Authorization: Bearer <N8N_BOT_SERVICE_TOKEN>`.

The token is HS256-signed, audience=`bot`, TTL 1 year. It's shared with
n8n via the env var `N8N_BOT_SERVICE_TOKEN`. Rotate quarterly:

```bash
# Admin-side: hit the rotate endpoint (admin JWT required)
curl -k -X POST https://api.xovenmart.com/api/v1/bot/auth/rotate \
  -H "Authorization: Bearer <ADMIN_JWT>"

# The new token is returned in the response body AND persisted to
# AppSetting.bot.serviceToken. n8n's "Config Source" credential polls
# this so a redeploy isn't needed.
```

### Inbound (Meta / Green → API)

- Meta (Messenger + WhatsApp Cloud): `X-Hub-Signature-256: sha256=<hex>` HMAC
  of the raw body, keyed by `META_APP_SECRET`. Verified by `BotWebhookGuard`.
- Green API: shared `?token=` query param, verified by `BotWebhookGuard`.

The webhook signature check uses `req.rawBody` — the raw bytes the provider
sent. NestJS's default JSON parser would mutate whitespace and key order,
which breaks HMAC even on valid events. The `express.raw({...})` middleware
in `apps/api/src/main.ts` captures the raw bytes BEFORE the body parser
runs, scoped to `/api/v1/bot/webhooks` only.

## Admin-controlled bot settings (AppSetting keys)

All bot settings live in the existing `AppSetting` KV table and are
editable from the admin panel's System → Settings page. Admin can edit
them at runtime without a redeploy.

| Key | Type | Default | Description |
|---|---|---|---|
| `bot.greetingBn` | string | "আসসালামু আলাইকুম! XovenMart-এ স্বাগতম।" | First-message reply (Bangla) |
| `bot.greetingEn` | string | "Hello! Welcome to XovenMart." | First-message reply (English) |
| `bot.fallbackBn` | string | "আমি বুঝতে পারিনি। 'দাম', 'অর্ডার', বা পণ্যের নাম লিখুন।" | "I didn't understand" (BN) |
| `bot.fallbackEn` | string | "I didn't catch that. Try 'price', 'order', or a product name." | "I didn't understand" (EN) |
| `bot.handoffReplyBn` | string | "একজন অ্যাডমিন শীঘ্রই যোগাযোগ করবেন।" | Auto-reply when handed off to human (BN) |
| `bot.handoffReplyEn` | string | "An admin will reach out shortly." | Auto-reply when handed off to human (EN) |
| `bot.businessHoursBn` | string | "আমাদের সেবা ২৪/৭ চালু।" | Auto-reply for hours-related questions (BN) |
| `bot.businessHoursEn` | string | "We're available 24/7." | Auto-reply for hours-related questions (EN) |
| `bot.handoffKeywords` | JSON array | `["admin","human","call me","অ্যাডমিন","মানুষ"]` | When a message contains any of these, bot hands off |
| `bot.maxTurnsPerSession` | number | `20` | Cost guardrail. Orders rejected after this many turns. |
| `bot.channels.MESSENGER.enabled` | bool | `true` | Admin can disable Messenger without redeploy |
| `bot.channels.WHATSAPP_CLOUD.enabled` | bool | `true` | Admin can disable WA Cloud without redeploy |
| `bot.channels.WHATSAPP_GREEN.enabled` | bool | `true` | Admin can disable WA Green without redeploy |
| `bot.featureFlags.showStockBadge` | bool | `true` | Bot replies include "in stock" / "out of stock" |
| `bot.featureFlags.recommendVariants` | bool | `true` | Bot suggests variant sizes when present |
| `bot.featureFlags.autoAddToCart` | bool | `false` | (Future) Bot pre-fills cart before asking confirm |
| `bot.featureFlags.sendReceiptAfterOrder` | bool | `true` | Bot sends orderNo + ETA after a successful place |
| `bot.serviceToken` | string | (managed) | Current `N8N_BOT_SERVICE_TOKEN`. Managed by `/bot/auth/rotate`. |

### Per-product bot visibility

Each `Product` has a `botVisible` boolean (default true). When false, the
bot's `/bot/catalog/search` and `/bot/catalog/product/:slug` endpoints
return that product as if it didn't exist — used for items that need
human-only handling (age-restricted, prescription, region-locked, etc.).
The product still appears on the web storefront.

## Idempotency

`POST /bot/orders/place` requires an `idempotencyKey` (UUID or any
globally-unique string ≤80 chars). Replays of the same key return the
original order without placing a new one. n8n workflow MUST mint a
fresh UUID per conversation turn that triggers `place_order`
(use `{{$execution.id}}` or `Crypto.randomUUID()`).

## Throttling

`POST /bot/orders/place` is throttled:
- 5 orders per phone per hour (prevents a compromised n8n from spamming
  the order pipeline).
- 20 orders per IP per minute (defense-in-depth).

## Rate limits & cost guardrails

The `BotConversation` table tracks `turnCount` and `handedOff` per
(channel, senderId). When `turnCount > bot.maxTurnsPerSession`, the
`placeOrder` endpoint rejects with 400 "Conversation exceeded
maxTurnsPerSession — please handoff to a human." This is the
circuit-breaker that protects against runaway LLM loops in the n8n
workflow.

## Audit / debug

Every webhook receive + every bot-action appends a `BotEvent` row.
Query:

```sql
SELECT * FROM bot_events
WHERE sender_id = '<PSID-or-phone>'
ORDER BY created_at DESC LIMIT 20;
```

The admin UI doesn't yet have a dedicated bot-events page — Phase 3
polish work; for now use n8n's built-in executions view for debugging.
