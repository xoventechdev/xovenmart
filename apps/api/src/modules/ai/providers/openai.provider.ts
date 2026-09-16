import { LlmVendor } from "@prisma/client";
import {
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
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_copy",
              strict: true,
              schema: jsonSchema,
            },
          },
          temperature,
          max_completion_tokens: maxOutputTokens,
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
      throw new Error(String(res.status));
    }

    const body = (await res.json()) as any;
    const choice = body?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string") {
      throw new Error("SCHEMA_INVALID");
    }
    let parsed: T;
    try {
      parsed = JSON.parse(content) as T;
    } catch {
      throw new Error("SCHEMA_INVALID");
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
