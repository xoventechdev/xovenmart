import { LlmVendor } from "@prisma/client";
import { OpenAiProvider } from "./openai.provider";

/**
 * OpenRouter adapter.
 *
 * OpenRouter exposes an OpenAI-compatible chat completions API
 * (https://openrouter.ai/api/v1/chat/completions) that proxies ~200
 * models from many vendors. Because the wire format is identical to
 * OpenAI's, we extend OpenAiProvider and only override the endpoint
 * and the required attribution headers.
 *
 * Required headers per https://openrouter.ai/docs/api-reference/authentication:
 *   - Authorization: Bearer <key>
 *   - HTTP-Referer:  app origin (we use the configured appTitle or
 *                    fall back to the public site)
 *   - X-Title:       human-readable label so OpenRouter's dashboard
 *                    shows this shop as the caller.
 *
 * Model IDs are namespaced:
 *   - anthropic/claude-3.5-haiku
 *   - meta-llama/llama-3.1-70b-instruct
 *   - google/gemini-2.5-flash
 *   - openai/gpt-4o-mini  (same model, different billing)
 *
 * `appTitle` is per-row and stored on LlmProvider; passed through
 * `extraHeaders` context the same way we pass apiKey in production.
 */
export class OpenRouterProvider extends OpenAiProvider {
  readonly id: LlmVendor = LlmVendor.OPENROUTER;
  readonly displayName = "OpenRouter";

  /** Per-instance label so OpenRouter shows this shop in its dashboard. */
  constructor(private readonly appTitle: string | null) {
    super();
  }

  protected endpoint(): string {
    return "https://openrouter.ai/api/v1/chat/completions";
  }

  protected extraHeaders(): Record<string, string> {
    // OpenRouter rejects (or silently strips) calls without these. Fall
    // back to the public site origin if appTitle was left blank in the
    // admin form — better a placeholder than no attribution.
    const referer = this.appTitle?.trim() || "https://xovenmart.com";
    const title = this.appTitle?.trim() || "XovenMart Admin";
    return {
      "HTTP-Referer": referer,
      "X-Title": title,
    };
  }

  /**
   * Cost lookup for the ~20 most popular OpenRouter models. OpenRouter
   * publishes per-token pricing at https://openrouter.ai/models; the
   * values here are per 1k tokens. Anything not in the table returns 0
   * so the admin still sees usage counts, just no $ estimate.
   *
   * OpenRouter charges slightly differently per routing, so true cost
   * for unrecognised models is unknown until the admin checks their
   * OpenRouter billing page. We document this in the admin UI.
   */
  estimateCostUsd(model: string, promptTokens: number, outputTokens: number): number {
    const table: Record<string, { in: number; out: number }> = {
      "openai/gpt-4o-mini":                 { in: 0.00015, out: 0.0006 },
      "openai/gpt-4o":                      { in: 0.0025,  out: 0.01 },
      "anthropic/claude-3.5-haiku":         { in: 0.0008,  out: 0.004 },
      "anthropic/claude-3.5-sonnet":        { in: 0.003,   out: 0.015 },
      "anthropic/claude-3-haiku":           { in: 0.00025, out: 0.00125 },
      "anthropic/claude-3-opus":            { in: 0.015,   out: 0.075 },
      "google/gemini-2.5-flash":            { in: 0.0003,  out: 0.0025 },
      "google/gemini-2.5-pro":              { in: 0.00125, out: 0.01 },
      "google/gemini-flash-1.5":            { in: 0.000075, out: 0.0003 },
      "meta-llama/llama-3.1-8b-instruct":  { in: 0.00003, out: 0.00006 },
      "meta-llama/llama-3.1-70b-instruct": { in: 0.0004,  out: 0.0004 },
      "meta-llama/llama-3.3-70b-instruct": { in: 0.0004,  out: 0.0004 },
      "mistralai/mistral-7b-instruct":     { in: 0.00003, out: 0.00006 },
      "mistralai/mistral-large-latest":    { in: 0.002,   out: 0.006 },
      "qwen/qwen-2.5-72b-instruct":        { in: 0.0004,  out: 0.0004 },
      "deepseek/deepseek-chat":            { in: 0.00014, out: 0.00028 },
    };
    const rate = table[model];
    if (!rate) return 0;
    return (promptTokens / 1000) * rate.in + (outputTokens / 1000) * rate.out;
  }
}
