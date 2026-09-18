-- Add kie.ai as the 5th LLM provider.
--
-- kie.ai (https://kie.ai) is an OpenAI-compatible chat API gateway
-- exposing ~200+ models from OpenAI, Anthropic, Google, Meta, etc.
-- typically at lower per-token prices than the source vendors. We add
-- the `KIEAI` value to the existing `llm_vendor` enum so admins can
-- configure a kie.ai provider row alongside OpenAI / Anthropic /
-- Gemini / OpenRouter.
--
-- Backwards-compat:
--   - Purely additive. No existing rows are touched.
--   - Existing adapters are unaffected; the new `KIEAI` enum value
--     is only used by `KieAiProvider` (subclass of OpenAiProvider
--     that overrides the endpoint URL).
--   - Postgres `ALTER TYPE ... ADD VALUE` cannot run inside a
--     transaction block, so this migration is automatically non-
--     transactional. The IF NOT EXISTS guard makes it idempotent for
--     manual re-runs.

ALTER TYPE "llm_vendor" ADD VALUE IF NOT EXISTS 'KIEAI';
