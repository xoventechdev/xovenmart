import { LlmVendor } from "@prisma/client";
import {
  extractJson,
  GenerateStructuredArgs,
  GenerateStructuredResult,
  LlmProviderAdapter,
} from "./provider.types";

/**
 * OpenAI Chat Completions adapter.
 *
 * POST https://api.openai.com/v1/chat/completions
 *
 * We use `response_format: { type: "json_schema", json_schema: {...} }`
 * to force valid JSON output. The schema's `additionalProperties: false`
 * is critical — without it OpenAI silently adds fields like `nameBn`
 * copies the admin didn't ask for.
 *
 * Errors are mapped to short, non-PII strings ("401", "429", "TIMEOUT",
 * "SCHEMA_INVALID") so the AiUsageEvent row never stores raw response
 * bodies. PII hygiene lives here, not in the controller.
 */
export class OpenAiProvider implements LlmProviderAdapter {
  readonly id: LlmVendor = LlmVendor.OPENAI;
  readonly displayName: string = "OpenAI";

  /** Subclasses (OpenRouter) override this. */
  protected endpoint(): string {
    return "https://api.openai.com/v1/chat/completions";
  }

  /** Subclasses add their own headers (HTTP-Referer for OpenRouter, etc.). */
  protected extraHeaders(): Record<string, string> {
    return {};
  }

  /**
   * Subclasses can merge vendor-specific body fields into the
   * OpenAI-shaped request — used by KieAiProvider to force
   * `include_thoughts: false` on the Gemini passthrough (kie.ai
   * defaults it to true, which makes the model use its output
   * budget on reasoning tokens and leave `content` empty →
   * SCHEMA_INVALID). Default: no extras.
   */
  protected extraBody(): Record<string, unknown> {
    return {};
  }

  /**
   * Pull the model's text out of an OpenAI-shaped `choices[0].message`
   * object. Default: return `message.content` (the standard OpenAI
   * field). Subclasses override to fall back to vendor-specific
   * reasoning fields when the model dumps its thinking into a
   * separate message field — see KieAiProvider for the Gemini 2.5
   * Flash reasoning_content fallback.
   *
   * Returns `null` if no usable text was found at all — the caller
   * throws SCHEMA_INVALID with diagnostic context in that case.
   */
  protected extractContent(message: Record<string, unknown> | null | undefined): string | null {
    if (!message) return null;
    const content = message.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return content;
    }
    return null;
  }

  async generateStructuredJson<T>(
    args: GenerateStructuredArgs,
  ): Promise<GenerateStructuredResult<T>> {
    const {
      apiKey,
      model,
      system,
      user,
      jsonSchema,
      temperature = 0.4,
      maxOutputTokens = 1024,
      timeoutMs = 15_000,
    } = args;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...this.extraHeaders(),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          // Note: we deliberately do NOT use `response_format: json_schema`
          // here. The vendor-specific structured-output modes (OpenAI
          // strict-mode, OpenRouter's strict schema, Gemini responseSchema,
          // Anthropic tool-use input_schema) each have their own quirks
          // and the same prompt + the same payload shape across all 4
          // vendors has a much higher success rate when we just ask for
          // raw JSON in the system prompt and parse it ourselves.
          // See `prompt-templates.ts` for the directive prompt.
          temperature,
          max_completion_tokens: maxOutputTokens,
          ...this.extraBody(),
        }),
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === "AbortError") {
        throw new Error("TIMEOUT");
      }
      throw new Error("NETWORK");
    }
    clearTimeout(timer);

    if (!res.ok) {
      // Don't surface raw response body — vendors sometimes echo user
      // content. Just the status code, which is enough for ops.
      if (process.env.AI_DEBUG === "1") {
        let errBody: any = null;
        try {
          errBody = await res.json();
        } catch {
          // ignore
        }
        // eslint-disable-next-line no-console
        console.log("[AI_DEBUG][openai:400]", JSON.stringify(errBody, null, 2));
      }
      throw new Error(String(res.status));
    }

    const body = (await res.json()) as any;
    const choice = body?.choices?.[0];
    const message = choice?.message ?? {};
    if (process.env.AI_DEBUG === "1") {
      // Dump enough fields to diagnose kie.ai/OpenRouter Gemini quirks
      // without AI_DEBUG being on permanently. We log:
      //   - content (first 400 chars — full content might echo admin
      //     product text, so truncate)
      //   - reasoning_content (Gemini passthroughs put thinking prose
      //     here when `include_thoughts` isn't honored — kie.ai bug)
      //   - refusal + finish_reason (for refusal / truncation diagnosis)
      //   - message_keys (so we notice if a vendor adds a new field
      //     we don't know about)
      // eslint-disable-next-line no-console
      console.log(
        "[AI_DEBUG][openai:200]",
        JSON.stringify(
          {
            model: body?.model,
            content: typeof message?.content === "string" ? message.content.slice(0, 400) : message?.content,
            reasoning_content: typeof message?.reasoning_content === "string" ? message.reasoning_content.slice(0, 400) : message?.reasoning_content,
            refusal: message?.refusal,
            finish_reason: choice?.finish_reason,
            message_keys: Object.keys(message ?? {}),
            usage: body?.usage,
          },
          null,
          2,
        ),
      );
    }
    // OpenAI may return 200 with a refusal (content moderation).
    if (message.refusal && !message.content) {
      throw new Error("REFUSAL");
    }
    // Try content first, then reasoning_content (kie.ai Gemini thinking
    // passthrough). extractContent() is overridable so subclasses can
    // add more fallbacks if they hit a new vendor quirk.
    const content = this.extractContent(message);
    if (typeof content !== "string" || content.trim().length === 0) {
      const err = new Error("SCHEMA_INVALID");
      // Attach a fingerprint of the failure so the calling service's
      // existing error log line surfaces WHICH field was empty. This
      // works WITHOUT AI_DEBUG=1 set, so the operator gets a usable
      // diagnostic from `docker logs xovenmart-api` on every failure.
      // eslint-disable-next-line no-console
      (err as any).cause = {
        reason: "empty_content",
        finishReason: choice?.finish_reason ?? null,
        messageKeys: Object.keys(message ?? {}),
        hasReasoningContent: typeof message?.reasoning_content === "string" && message.reasoning_content.length > 0,
        reasoningPreview: typeof message?.reasoning_content === "string" ? message.reasoning_content.slice(0, 200) : null,
      };
      throw err;
    }
    let parsed: T;
    try {
      parsed = extractJson<T>(content);
    } catch (e: any) {
      const err = new Error("SCHEMA_INVALID");
      // eslint-disable-next-line no-console
      (err as any).cause = {
        reason: "extract_failed",
        extractError: e?.message ?? String(e),
        contentPreview: content.slice(0, 200),
        contentTail: content.length > 200 ? content.slice(-200) : null,
      };
      throw err;
    }

    return {
      data: parsed,
      usage: {
        promptTokens: Number(body?.usage?.prompt_tokens ?? 0),
        outputTokens: Number(body?.usage?.completion_tokens ?? 0),
      },
      model: String(body?.model ?? model),
    };
  }

  /**
   * Per-1k-token USD rates for the models we expect admins to pick.
   * Numbers are public list prices — refresh when OpenAI changes them.
   *
   * For unrecognised models we return 0 so the admin still sees token
   * counts; cost shows as $0.00 in the UI rather than crashing.
   */
  estimateCostUsd(model: string, promptTokens: number, outputTokens: number): number {
    const table: Record<string, { in: number; out: number }> = {
      "gpt-4o-mini":           { in: 0.00015, out: 0.0006 },
      "gpt-4o":                { in: 0.0025,  out: 0.01 },
      "gpt-4.1-mini":          { in: 0.0004,  out: 0.0016 },
      "gpt-4.1":               { in: 0.002,   out: 0.008 },
      "o4-mini":               { in: 0.0011,  out: 0.0044 },
      "o3-mini":               { in: 0.0011,  out: 0.0044 },
      "gpt-3.5-turbo":         { in: 0.0005,  out: 0.0015 },
    };
    const rate = table[model];
    if (!rate) return 0;
    return (promptTokens / 1000) * rate.in + (outputTokens / 1000) * rate.out;
  }
}
