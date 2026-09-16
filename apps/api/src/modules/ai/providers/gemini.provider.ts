import { LlmVendor } from "@prisma/client";
import {
  extractJson,
  GenerateStructuredArgs,
  GenerateStructuredResult,
  LlmProviderAdapter,
} from "./provider.types";

/**
 * Google Gemini adapter.
 *
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
 *
 * We use prompt-only JSON (no `responseMimeType`/`responseSchema`).
 * The cross-vendor `jsonSchema` arg is accepted for interface
 * compatibility but unused here — see the OpenAI adapter's comment
 * for the full reasoning.
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
      // jsonSchema is part of the interface contract but unused for
      // prompt-only JSON mode. Pull it out so TS doesn't warn and so
      // future readers see the call site is intentional.
      jsonSchema: _jsonSchema,
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
            // We deliberately do NOT set responseMimeType: "application/json"
            // or responseSchema here. Gemini's structured-output mode
            // requires a strict subset of JSON Schema (uppercase Type,
            // no additionalProperties) that's painful to keep in sync with
            // the cross-vendor schema. The prompt instructs the model to
            // emit a single JSON object and `extractJson()` handles the
            // messy cases (fences, leading prose, trailing prose).
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
      if (process.env.AI_DEBUG === "1") {
        let errBody: any = null;
        try {
          errBody = await res.json();
        } catch {
          // ignore
        }
        // eslint-disable-next-line no-console
        console.log("[AI_DEBUG][gemini:err]", JSON.stringify(errBody, null, 2));
      }
      throw new Error(String(res.status));
    }

    const body = (await res.json()) as any;
    if (process.env.AI_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.log(
        "[AI_DEBUG][gemini:200]",
        JSON.stringify(
          {
            modelVersion: body?.modelVersion,
            candidates: body?.candidates?.map((c: any) => ({
              finishReason: c?.finishReason,
              text: c?.content?.parts?.[0]?.text?.slice?.(0, 400),
            })),
          },
          null,
          2,
        ),
      );
    }
    const text: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("SCHEMA_INVALID");
    }
    let parsed: T;
    try {
      parsed = extractJson<T>(text);
    } catch (e: any) {
      if (process.env.AI_DEBUG === "1") {
        // eslint-disable-next-line no-console
        console.log(
          "[AI_DEBUG][gemini:extract-failed]",
          "first 400 chars:",
          text?.slice(0, 400),
        );
      }
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
