import { LlmVendor } from "@prisma/client";
import {
  GenerateStructuredArgs,
  GenerateStructuredResult,
  LlmProviderAdapter,
} from "./provider.types";

/**
 * Google Gemini adapter.
 *
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
 *
 * Gemini supports structured output via `responseSchema` +
 * `responseMimeType: "application/json"`. The schema syntax is
 * essentially JSON Schema Draft 2020-12 with a few minor restrictions
 * (e.g. uppercase `Type` instead of lowercase `type`) — Gemini is
 * strict about these and will 400 otherwise. We translate our
 * JSON Schema into Gemini's expected shape by uppercasing the `type`
 * values.
 *
 * Errors map to short codes ("401", "403", "429", "TIMEOUT",
 * "SCHEMA_INVALID") so the usage event stores no PII.
 */
export class GeminiProvider implements LlmProviderAdapter {
  readonly id: LlmVendor = LlmVendor.GEMINI;
  readonly displayName = "Gemini";

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

    // Gemini wants the model + key in the URL, not headers.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // systemInstruction is a top-level field in Gemini, not a
          // chat message — keeps the same convention OpenAI/Anthropic
          // use but in Gemini's expected shape.
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: "user",
              parts: [{ text: user }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens,
            responseMimeType: "application/json",
            responseSchema: this.adaptSchema(jsonSchema),
          },
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
    const text: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("SCHEMA_INVALID");
    }
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      throw new Error("SCHEMA_INVALID");
    }

    return {
      data: parsed,
      usage: {
        promptTokens: Number(body?.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(body?.usageMetadata?.candidatesTokenCount ?? 0),
      },
      model: String(body?.modelVersion ?? model),
    };
  }

  /**
   * Translate JSON Schema into Gemini's `responseSchema` shape.
   *
   * The differences vs vanilla JSON Schema Draft 2020-12:
   *   - `type` must be uppercase ("STRING" vs "string")
   *   - `properties.{k}.type` must also be uppercase
   *   - `additionalProperties: false` is implicit (Gemini rejects
   *     extra fields by default), so we strip it.
   *
   * Recurses through the tree.
   */
  private adaptSchema(node: any): any {
    if (Array.isArray(node)) {
      return node.map((v) => this.adaptSchema(v));
    }
    if (node === null || typeof node !== "object") {
      return node;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "type" && typeof v === "string") {
        out[k] = v.toUpperCase();
      } else if (k === "additionalProperties" && v === false) {
        // Gemini doesn't accept the field; drop it.
        continue;
      } else {
        out[k] = this.adaptSchema(v);
      }
    }
    return out;
  }

  /**
   * Gemini public list prices (USD per 1k tokens, ≤200k context).
   * Refresh when Google changes pricing.
   */
  estimateCostUsd(model: string, promptTokens: number, outputTokens: number): number {
    const table: Record<string, { in: number; out: number }> = {
      "gemini-2.5-flash":   { in: 0.0003, out: 0.0025 },
      "gemini-2.5-pro":     { in: 0.00125, out: 0.01 },
      "gemini-2.0-flash":   { in: 0.0001, out: 0.0004 },
      "gemini-1.5-flash":   { in: 0.000075, out: 0.0003 },
      "gemini-1.5-pro":     { in: 0.00125, out: 0.005 },
      "gemini-1.5-flash-8b":{ in: 0.0000375, out: 0.00015 },
    };
    const rate = table[model];
    if (!rate) return 0;
    return (promptTokens / 1000) * rate.in + (outputTokens / 1000) * rate.out;
  }
}
