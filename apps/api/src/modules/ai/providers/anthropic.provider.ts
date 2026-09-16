import { LlmVendor } from "@prisma/client";
import {
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
          tools: [
            {
              name: "return_json",
              description:
                "Return the requested product copy as JSON. Always call this tool exactly once with the structured output — do not include any prose outside the tool call.",
              input_schema: jsonSchema,
            },
          ],
          // Force tool_choice so the model can't decide to skip the JSON
          // tool and reply with free-form text instead.
          tool_choice: { type: "tool", name: "return_json" },
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
      throw new Error(String(res.status));
    }

    const body = (await res.json()) as any;
    // Find the tool_use block. Anthropic returns content[]; we want the
    // first block where `type === "tool_use" && name === "return_json"`.
    const blocks: any[] = Array.isArray(body?.content) ? body.content : [];
    const toolBlock = blocks.find(
      (b: any) => b?.type === "tool_use" && b?.name === "return_json",
    );
    if (!toolBlock || typeof toolBlock.input !== "object") {
      throw new Error("SCHEMA_INVALID");
    }

    return {
      data: toolBlock.input as T,
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
