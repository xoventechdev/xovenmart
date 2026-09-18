import { LlmVendor } from "@prisma/client";
import { OpenAiProvider } from "./openai.provider";

/**
 * kie.ai adapter.
 *
 * kie.ai (https://kie.ai) is an OpenAI-compatible chat API gateway
 * that proxies ~200+ models from many upstream vendors (OpenAI,
 * Anthropic, Google, Meta, etc.) typically at lower per-token
 * prices than the source vendors. The wire format is identical to
 * OpenAI's `POST /v1/chat/completions` so we extend `OpenAiProvider`
 * and only override the endpoint URL.
 *
 * Unlike OpenRouter, kie.ai does NOT require `HTTP-Referer` /
 * `X-Title` attribution headers — the only required header is
 * `Authorization: Bearer <key>`. So we do NOT override
 * `extraHeaders()`.
 *
 * Model IDs are namespaced exactly like the upstream vendor's
 * canonical id (no `vendor/` prefix). Examples:
 *   - gpt-4o-mini
 *   - claude-3-5-haiku-latest
 *   - gemini-2.5-flash
 *   - meta-llama/llama-3.1-70b-instruct
 *
 * Pricing on kie.ai is best-effort estimated: the per-1k-token USD
 * rates below are samples pulled from kie.ai's public model list at
 * integration time. Admins can see accurate token counts in the
 * usage card regardless of whether the model is in the lookup table.
 */
export class KieAiProvider extends OpenAiProvider {
  readonly id: LlmVendor = LlmVendor.KIEAI;
  readonly displayName = "kie.ai";

  protected endpoint(): string {
    return "https://api.kie.ai/v1/chat/completions";
  }

  /**
   * kie.ai passthrough-specific body fields. The parent
   * `OpenAiProvider.generateStructuredJson()` already builds a
   * standard OpenAI request; we just merge a few vendor quirks in
   * here so the upstream call works on every proxied model.
   *
   * Why this exists (specific to gemini-2.5-flash on kie.ai):
   *   kie.ai's Gemini passthrough defaults `include_thoughts` to
   *   true, which makes the model spend its output budget on
   *   reasoning tokens and leave the actual JSON answer empty /
   *   truncated. That manifests in our adapter as SCHEMA_INVALID
   *   because `choices[0].message.content` is empty or pure
   *   thinking-prose. Forcing `include_thoughts: false` here makes
   *   Gemini behave like a non-reasoning chat model and produce the
   *   JSON object directly. Other proxied models (gpt-4o-mini,
   *   claude-3-5-haiku, llama, deepseek) ignore unknown fields, so
   *   this is safe to send unconditionally.
   */
  protected extraBody(): Record<string, unknown> {
    return {
      // Skip the thinking/reasoning preamble so the JSON answer
      // lands in `choices[0].message.content` instead of being
      // truncated to empty. See kie.ai docs / Gemini 2.5 Flash
      // section: `include_thoughts` defaults to true on the kie.ai
      // gateway.
      include_thoughts: false,
      // Force non-streaming — the parent already expects a single
      // JSON response. Some proxied models default to streaming even
      // when `stream` is absent.
      stream: false,
    };
  }

  /**
   * Cost lookup for the most popular kie.ai-proxied models. Rates
   * are USD per 1k tokens. Anything not in the table returns 0 so
   * the admin still sees usage counts, just no $ estimate — they
   * can check the kie.ai billing page for the exact rate.
   *
   * The values are public-list-time samples (not live billing
   * rates); refresh when kie.ai publishes a major pricing change.
   */
  estimateCostUsd(model: string, promptTokens: number, outputTokens: number): number {
    const table: Record<string, { in: number; out: number }> = {
      // OpenAI family
      "gpt-4o-mini":                  { in: 0.00015,  out: 0.0006 },
      "gpt-4o":                       { in: 0.0025,   out: 0.01 },
      "gpt-4.1-mini":                 { in: 0.0004,   out: 0.0016 },
      "gpt-4.1":                      { in: 0.002,    out: 0.008 },
      "o4-mini":                      { in: 0.0011,   out: 0.0044 },
      // Anthropic family
      "claude-3-5-haiku-latest":      { in: 0.0008,   out: 0.004 },
      "claude-3-5-sonnet-latest":     { in: 0.003,    out: 0.015 },
      "claude-3-haiku-20240307":      { in: 0.00025,  out: 0.00125 },
      // Google family
      "gemini-2.5-flash":             { in: 0.0003,   out: 0.0025 },
      "gemini-2.5-pro":               { in: 0.00125,  out: 0.01 },
      "gemini-2.0-flash":             { in: 0.0001,   out: 0.0004 },
      "gemini-1.5-flash":             { in: 0.000075, out: 0.0003 },
      "gemini-1.5-pro":               { in: 0.00125,  out: 0.005 },
      // Meta Llama family (often namespaced as on OpenRouter)
      "meta-llama/llama-3.1-8b-instruct":   { in: 0.00003, out: 0.00006 },
      "meta-llama/llama-3.1-70b-instruct":  { in: 0.0004,  out: 0.0004 },
      "meta-llama/llama-3.3-70b-instruct":  { in: 0.0004,  out: 0.0004 },
      // DeepSeek family
      "deepseek-chat":                { in: 0.00014,  out: 0.00028 },
      // Mistral family
      "mistral-large-latest":         { in: 0.002,    out: 0.006 },
    };
    const rate = table[model];
    if (!rate) return 0;
    return (promptTokens / 1000) * rate.in + (outputTokens / 1000) * rate.out;
  }
}
