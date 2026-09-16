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

/**
 * Pull a JSON object out of a model's free-form text response.
 *
 * Most LLMs follow "JSON only" instructions and emit `{"...": ...}` as
 * the entire response. Some occasionally wrap it in a markdown code
 * fence (`\`\`\`json\n{...}\n\`\`\``); some prefix a sentence; a few
 * append a follow-up "here's the JSON" line. This helper handles all
 * of those cases:
 *
 *   1. Trim the response.
 *   2. If it starts with ```, strip the opening fence (and optional
 *      language tag) and the closing ``` if present.
 *   3. Find the first `{` and the matching closing `}` — naive but
 *      works because our schema is a single top-level object and we
 *      don't ask for nested arrays of objects.
 *   4. JSON.parse the slice.
 *
 * If none of that yields a parseable object, throws — the adapter
 * surfaces this as SCHEMA_INVALID and logs the raw content to the
 * debug stream when AI_DEBUG=1.
 */
export function extractJson<T>(text: string): T {
  if (typeof text !== "string") {
    throw new Error("not a string");
  }
  let s = text.trim();

  // Strip ```json ... ``` / ``` ... ``` fences.
  if (s.startsWith("```")) {
    // Drop the opening fence line: ```json or ```
    const firstNewline = s.indexOf("\n");
    if (firstNewline > 0) s = s.slice(firstNewline + 1);
    const closing = s.lastIndexOf("```");
    if (closing >= 0) s = s.slice(0, closing);
    s = s.trim();
  }

  // Some models prefix a sentence ("Here is the JSON:") or append one
  // ("Let me know if you need changes."). Slice from the first `{` to
  // the matching closing brace.
  const first = s.indexOf("{");
  if (first < 0) {
    throw new Error("no opening brace");
  }
  // Find the LAST `}` — robust against models that append prose after
  // the JSON. The schema's content doesn't contain unescaped `}`.
  const last = s.lastIndexOf("}");
  if (last < 0 || last < first) {
    throw new Error("no closing brace");
  }
  const slice = s.slice(first, last + 1);
  return JSON.parse(slice) as T;
}
