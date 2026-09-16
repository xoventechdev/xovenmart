import { LlmVendor } from "@prisma/client";
import {
  extractJson,
  GenerateStructuredArgs,
  GenerateStructuredResult,
  LlmProviderAdapter,
} from "./provider.types";

/**
 * Anthropic Messages API adapter.
 *
 * POST https://api.anthropic.com/v1/messages
 *
 * Anthropic doesn't have a native `response_format` like OpenAI; the
 * idiomatic way to force JSON output is "tool use" — define a
 * synthetic tool with the desired schema as `input_schema`, force
 * the model to call it, then read the tool-call's `input` field.
 * We expose a no-op tool name (`return_json`) and ignore the rest.
 *
 * Error mapping mirrors OpenAiProvider: short, non-PII codes only.
 */
export class AnthropicProvider implements LlmProviderAdapter {
  readonly id: LlmVendor = LlmVendor.ANTHROPIC;
  readonly displayName = "Anthropic";

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
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          // Anthropic requires this header; pinned to a stable value so
          // our logs can match later if a beta changes shape.
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system,
          messages: [{ role: "user", content: user }],
          temperature,
          max_tokens: maxOutputTokens,
          // We deliberately do NOT use Anthropic's tool-use mechanism
          // (the previous code passed `tools: [{name: "return_json",
          // input_schema: jsonSchema}]` + forced `tool_choice`). Anthropic
          // ignores the schema's `additionalProperties: false` for
          // input_schema and Claude sometimes ignores `minLength`/
          // `maxLength` — the result was inconsistent output shapes across
          // model versions. The prompt itself instructs the model to emit
          // a single JSON object, and `extractJson()` handles markdown
          // fences and trailing prose. More portable, fewer edge cases.
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
      if (process.env.AI_DEBUG === "1") {
        let errBody: any = null;
        try {
          errBody = await res.json();
        } catch {
          // ignore
        }
        // eslint-disable-next-line no-console
        console.log("[AI_DEBUG][anthropic:err]", JSON.stringify(errBody, null, 2));
      }
      throw new Error(String(res.status));
    }

    const body = (await res.json()) as any;
    if (process.env.AI_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log(
        "[AI_DEBUG][anthropic:200]",
        JSON.stringify(
          {
            model: body?.model,
            content: body?.content?.map((b: any) => ({ type: b?.type, text: b?.text?.slice?.(0, 400) })),
            stop_reason: body?.stop_reason,
          },
          null,
          2,
        ),
      );
    }
    // Concatenate all text blocks (Claude sometimes splits the JSON
    // across two text blocks; or sends an empty text + a thinking
    // block we should ignore).
    const blocks: any[] = Array.isArray(body?.content) ? body.content : [];
    const text = blocks
      .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
      .map((b: any) => b.text)
      .join("\n");
    if (!text) {
      throw new Error("SCHEMA_INVALID");
    }
    let parsed: T;
    try {
      parsed = extractJson<T>(text);
    } catch (e: any) {
      if (process.env.AI_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.log(
          "[AI_DEBUG][anthropic:extract-failed]",
          "first 400 chars:",
          text?.slice(0, 400),
        );
      }
      throw new Error("SCHEMA_INVALID");
    }

    return {
      data: parsed,
      usage: {
        promptTokens: Number(body?.usage?.input_tokens ?? 0),
        outputTokens: Number(body?.usage?.output_tokens ?? 0),
      },
      model: String(body?.model ?? model),
    };
  }

  /**
   * Anthropic public list prices (USD per 1k tokens). Refresh when
   * Anthropic changes pricing.
   */
  estimateCostUsd(model: string, promptTokens: number, outputTokens: number): number {
    const table: Record<string, { in: number; out: number }> = {
      "claude-3-5-haiku-latest":  { in: 0.0008, out: 0.004 },
      "claude-3-5-sonnet-latest": { in: 0.003,  out: 0.015 },
      "claude-3-haiku-20240307":  { in: 0.00025, out: 0.00125 },
      "claude-3-sonnet-20240229": { in: 0.003,  out: 0.015 },
      "claude-3-opus-20240229":   { in: 0.015,  out: 0.075 },
      "claude-4-haiku":           { in: 0.001,  out: 0.005 },
      "claude-4-sonnet":          { in: 0.003,  out: 0.015 },
      "claude-4-opus":            { in: 0.015,  out: 0.075 },
    };
    const rate = table[model];
    if (!rate) return 0;
    return (promptTokens / 1000) * rate.in + (outputTokens / 1000) * rate.out;
  }
}
