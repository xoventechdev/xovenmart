/**
 * Standalone debug script: hit each LLM provider with the EXACT prompt
 * the product-copy feature uses, print the raw response body so we
 * can see what shape the model actually emits.
 *
 * Why this exists: when admins report "Failed (SCHEMA_INVALID)" we
 * need to look at the raw response, not a redacted error code. This
 * script bypasses the API's parsing/validation layer and just shows
 * the raw text the model returned.
 *
 * Usage (PowerShell):
 *   $env:OPENAI_API_KEY = "sk-..."
 *   pnpm exec ts-node apps/api/scripts/debug-ai-raw.ts openai gpt-4o-mini
 *   $env:ANTHROPIC_API_KEY = "sk-ant-..."
 *   pnpm exec ts-node apps/api/scripts/debug-ai-raw.ts anthropic claude-3-5-haiku-latest
 *   $env:GEMINI_API_KEY = "AIza..."
 *   pnpm exec ts-node apps/api/scripts/debug-ai-raw.ts gemini gemini-2.5-flash
 *   $env:OPENROUTER_API_KEY = "sk-or-..."
 *   pnpm exec ts-node apps/api/scripts/debug-ai-raw.ts openrouter openai/gpt-4o-mini
 *
 * Args:
 *   vendor: openai | anthropic | gemini | openrouter
 *   model:  the model id (free-text)
 *
 * The script does NOT validate the response. It just prints the raw
 * text so the human can paste it back into the team chat and we can
 * design the right schema around it.
 *
 * Side effects: none. The script exits with code 0 on success or 1
 * on any error so it's safe to wire into a manual test pipeline.
 */

import { buildProductCopyPrompt } from "../src/modules/ai/prompt-templates";

type Vendor = "openai" | "anthropic" | "gemini" | "openrouter";

const [, , vendorArg, modelArg] = process.argv;
if (!vendorArg || !modelArg) {
  console.error(
    "usage: ts-node scripts/debug-ai-raw.ts <openai|anthropic|gemini|openrouter> <model-id>",
  );
  process.exit(2);
}
const vendor = vendorArg as Vendor;
const model = modelArg;

const { system, user } = buildProductCopyPrompt({
  nameEn: "Premium Basmati Rice",
  nameBn: "",
  categoryName: "Grocery",
  unit: "kg",
  brand: "Aarong",
});
const promptUserMessage = user;

async function callOpenAi() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: promptUserMessage },
      ],
      temperature: 0.4,
      max_completion_tokens: 1024,
    }),
  });
  return { status: r.status, body: await r.text() };
}

async function callAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      messages: [{ role: "user", content: promptUserMessage }],
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });
  return { status: r.status, body: await r.text() };
}

async function callGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: promptUserMessage }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }),
  });
  return { status: r.status, body: await r.text() };
}

async function callOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://xovenmart.com",
      "X-Title": "XovenMart Admin",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: promptUserMessage },
      ],
      temperature: 0.4,
      max_completion_tokens: 1024,
    }),
  });
  return { status: r.status, body: await r.text() };
}

(async () => {
  try {
    const result = await (vendor === "openai"
      ? callOpenAi()
      : vendor === "anthropic"
        ? callAnthropic()
        : vendor === "gemini"
          ? callGemini()
          : callOpenRouter());
    // eslint-disable-next-line no-console
    console.log(`STATUS: ${result.status}`);
    // eslint-disable-next-line no-console
    console.log(`BODY: ${result.body}`);
    process.exit(result.status >= 200 && result.status < 300 ? 0 : 1);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(`ERROR: ${e?.message ?? e}`);
    process.exit(1);
  }
})();