-- Extend OrderSource with the three bot channel values.
--
-- Postgres `ALTER TYPE ... ADD VALUE` cannot run inside a transaction
-- block, so this migration is auto-marked non-transactional by Prisma's
-- SQL parser (it detects the ADD VALUE pattern). `IF NOT EXISTS` makes
-- this idempotent for manual re-runs.
--
-- MESSENGER  — orders placed via Facebook Messenger
-- WHATSAPP_CLOUD — orders placed via the official WhatsApp Cloud API
-- WHATSAPP_GREEN — orders placed via the unofficial Green API gateway
--
-- Backwards-compat: purely additive, no existing rows touched.

ALTER TYPE "order_source" ADD VALUE IF NOT EXISTS 'MESSENGER';
ALTER TYPE "order_source" ADD VALUE IF NOT EXISTS 'WHATSAPP_CLOUD';
ALTER TYPE "order_source" ADD VALUE IF NOT EXISTS 'WHATSAPP_GREEN';
