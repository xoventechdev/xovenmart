/**
 * Shared types + the LlmProviderAdapter contract used by every vendor
 * adapter in this folder. The contract is intentionally minimal so
 * adding a new vendor is a 1-file job (write an adapter + register
 * it in `ai.service.ts`'s provider map).
 *
 * Why this lives in a separate file: NestJS DI is fine with circular
 * imports between sibling classes but not between sibling files in
 * the same module; keeping the interface here breaks the cycle when
 * adapters reference each other (e.g. OpenRouter extends OpenAiProvider).
 */
import { LlmVendor } from "@prisma/client";

export interface GenerateStructuredArgs {
  /** Decrypted API key. Never logged. */
  apiKey: string;
  /** Free-text model ID ("gpt-4o-mini", "claude-3-5-haiku-latest", etc). */
  model: string;
  system: string;
  user: string;
  /** JSON Schema describing the desired response shape. The adapter
   *  translates this into the vendor's native "give me JSON" mechanism
   *  (OpenAI/OpenRouter `response_format`, Gemini `responseSchema`,
   *  Anthropic tool-use with a synthetic `return_json` tool). */
  jsonSchema: Record<string, unknown>;
  /** Optional. Default 0.4 — low enough that the same product hint
   *  produces consistent drafts across re-rolls. */
  temperature?: number;
  /** Optional. Default 1024 — fits our 5-field product-copy schema. */
  maxOutputTokens?: number;
  /** Optional. Default 15_000 ms. Adapter must `AbortController`-abort
   *  the request when this elapses. */
  timeoutMs?: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  usage: { promptTokens: number; outputTokens: number };
  /** The model the vendor actually charged us for (sometimes different
   *  from the one we asked for when the model is an alias / behind a
   *  load-balancer). Echoed back to the admin so they know. */
  model: string;
}

export interface LlmProviderAdapter {
  readonly id: LlmVendor;
  /** Human-readable name for logs / admin UI dropdown. */
  readonly displayName: string;
  generateStructuredJson<T>(
    args: GenerateStructuredArgs,
  ): Promise<GenerateStructuredResult<T>>;
  /** Best-effort USD estimate. Returns 0 when the model isn't in the
   *  in-file lookup — admins still see token counts, just no $ value. */
  estimateCostUsd(model: string, promptTokens: number, outputTokens: number): number;
}
