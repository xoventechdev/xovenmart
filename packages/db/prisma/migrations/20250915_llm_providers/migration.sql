-- Add multi-provider AI config (LlmProvider + LlmVendor + AiUsageEvent).
--
-- Why these tables exist:
--
--   - LlmProvider: one row per configured AI vendor. API keys are
--     AES-256-GCM ciphertext stored in `api_key_cipher / _iv / _tag`
--     columns. Decrypted only inside the API process via
--     SecretsService.decrypt(); never returned over the wire.
--   - AiUsageEvent: one row per generation call — used for spend
--     tracking + the admin "recent usage" card. Stores token counts
--     + a short non-PII errorCode; deliberately NO request/response
--     bodies (PII hygiene).
--
-- Backwards-compat guarantees:
--   - Both tables are NEW. No existing rows are touched.
--   - All columns are nullable OR have defaults, so even a half-
--     configured admin can boot the app without errors.
--   - The `is_default` column has no DB-level uniqueness. The
--     "exactly one default" rule is enforced in the service layer
--     inside a single Prisma $transaction on flip.
--
-- Idempotency note:
--   Prisma's migration runner applies this exactly once. We do NOT
--   add `IF NOT EXISTS` — Prisma can't diff such statements safely.
--   On a dev DB that's drifted (missing `users` table from earlier
--   resets), run `prisma migrate resolve --applied` for this entry
--   after restoring the rest of the schema from a fresh dump.

-- CreateEnum
CREATE TYPE "llm_vendor" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI', 'OPENROUTER');

-- CreateTable: LlmProvider
CREATE TABLE "llm_providers" (
    "id"              TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "provider"        "llm_vendor" NOT NULL,
    "model"           TEXT NOT NULL,
    "api_key_cipher"  TEXT NOT NULL,
    "api_key_iv"      TEXT NOT NULL,
    "api_key_tag"     TEXT NOT NULL,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "is_default"      BOOLEAN NOT NULL DEFAULT false,
    "monthly_usd_cap" DECIMAL(10, 2),
    "app_title"       TEXT,
    "created_by_id"   TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AiUsageEvent
CREATE TABLE "ai_usage_events" (
    "id"                  TEXT NOT NULL,
    "provider_id"         TEXT NOT NULL,
    "actor_id"            TEXT NOT NULL,
    "feature"             TEXT NOT NULL,
    "model"               TEXT NOT NULL,
    "prompt_tokens"       INTEGER NOT NULL,
    "output_tokens"       INTEGER NOT NULL,
    "estimated_cost_usd"  DECIMAL(10, 6) NOT NULL,
    "duration_ms"         INTEGER NOT NULL,
    "ok"                  BOOLEAN NOT NULL,
    "error_code"          TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_providers_is_active_idx" ON "llm_providers"("is_active");
CREATE INDEX "llm_providers_provider_is_active_idx" ON "llm_providers"("provider", "is_active");

CREATE INDEX "ai_usage_events_provider_id_created_at_idx" ON "ai_usage_events"("provider_id", "created_at");
CREATE INDEX "ai_usage_events_actor_id_created_at_idx" ON "ai_usage_events"("actor_id", "created_at");
CREATE INDEX "ai_usage_events_created_at_idx" ON "ai_usage_events"("created_at");

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
