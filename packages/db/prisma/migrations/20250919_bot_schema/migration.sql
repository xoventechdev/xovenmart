-- ============================================================
-- Bot messaging integration — Phase 1 schema
--
-- Adds the columns on orders + products and the three audit tables
-- (bot_events / bot_idempotency / bot_conversations) backing the
-- bot-facing API surface. Companion migration
-- `20250919_bot_order_source_enum` extends the `order_source` enum
-- — that file is auto-marked non-transactional by Prisma because
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block.
-- This file is plain transactional DDL.
--
-- Backwards-compat
--   * Purely additive. No existing rows are touched.
--   * `bot_visible` defaults to true so every existing product
--     stays bot-reachable after the migration.
--   * `bot_idempotency.order_id` is nullable so deleting an Order
--     doesn't cascade-delete its idempotency record (the record
--     is itself the proof the order existed).
-- ============================================================

-- Stamp bot identity on orders placed via /bot/orders/place.
-- All three columns are nullable: orders placed via the web /
-- Android / POS (the existing 3 channels) don't have a sender.
ALTER TABLE "orders"
  ADD COLUMN "bot_channel" TEXT,
  ADD COLUMN "bot_sender_id" TEXT,
  ADD COLUMN "bot_conversation_id" TEXT;

-- Per-product bot-visibility toggle. Defaults to true so every
-- existing product stays bot-reachable. Admin flips to false on
-- the product form to hide an item from chat replies (e.g. age-
-- restricted, region-locked) without unpublishing it from the
-- web storefront.
ALTER TABLE "products"
  ADD COLUMN "bot_visible" BOOLEAN NOT NULL DEFAULT true;

-- Append-only audit log for inbound + outbound bot events. One
-- table backs the conversation history endpoint and Meta's
-- webhook-retry dedup (UNIQUE on message_id).
CREATE TABLE "bot_events" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "customer_phone" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "message_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_events_message_id_key" ON "bot_events"("message_id");
CREATE INDEX "bot_events_channel_sender_id_created_at_idx" ON "bot_events"("channel", "sender_id", "created_at");
CREATE INDEX "bot_events_status_created_at_idx" ON "bot_events"("status", "created_at");
CREATE INDEX "bot_events_customer_phone_created_at_idx" ON "bot_events"("customer_phone", "created_at");

-- Idempotency table for /bot/orders/place. Caller passes a UUID
-- per conversation turn; replays return the original order.
-- No cascade FK on order_id so deleting an Order doesn't
-- cascade-delete its idempotency record (the record itself is
-- the proof the order existed).
CREATE TABLE "bot_idempotency" (
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_idempotency_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "bot_idempotency_created_at_idx" ON "bot_idempotency"("created_at");

ALTER TABLE "bot_idempotency"
  ADD CONSTRAINT "bot_idempotency_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-(channel, sender) conversation state. turnCount feeds the
-- cost guardrail; handedOff is the sticky human-routing flag.
CREATE TABLE "bot_conversations" (
    "channel" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "handed_off" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_conversations_channel_sender_id_key" UNIQUE ("channel", "sender_id")
);

CREATE INDEX "bot_conversations_handed_off_last_seen_at_idx" ON "bot_conversations"("handed_off", "last_seen_at");
