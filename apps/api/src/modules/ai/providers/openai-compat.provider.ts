import { LlmVendor } from "@prisma/client";
import { OpenAiProvider } from "./openai.provider";

/**
 * Generic OpenAI-compatible adapter.
 *
 * Use this when an LlmProvider row has `baseUrl` set — covers
 * Azure OpenAI (https://{resource}.openai.azure.com/openai/deployments/...),
 * Groq (https://api.groq.com/openai/v1), Together
 * (https://api.together.xyz/v1), OpenRouter with a custom gateway,
 * self-hosted llama.cpp, ollama with the OpenAI-compat shim, etc.
 *
 * Wire format is identical to OpenAI's `/v1/chat/completions`:
 *   - POST {baseUrl}/chat/completions
 *   - Bearer auth header
 *   - JSON body with `messages`, `model`, `temperature`, etc.
 *
 * Cost estimation is intentionally a no-op: each "vendor" behind a
 * generic gateway has its own pricing, and we have no signal which one
 * a particular row is. Token counts still flow into `AiUsageEvent`
 * so admins see usage, just no $ column for these rows.
 *
 * The base URL is stripped of any trailing slash on construction so
 * we can always safely do `${base}/chat/completions`.
 *
 * Selection logic lives in `AiService.buildAdapterFor()` — any row
 * with `baseUrl` set is routed here, regardless of `provider` enum.
 * The enum still describes the family (OpenAI, OpenRouter, etc.) so
 * the admin UI dropdown stays meaningful and billing panels can group
 * by family.
 */
export class OpenAiCompatProvider extends OpenAiProvider {
  readonly id: LlmVendor = LlmVendor.OPENAI; // family = OpenAI for display
  readonly displayName: string = "OpenAI-compatible";

  constructor(private readonly rawBaseUrl: string) {
    super();
  }

  /** Strip a single trailing slash — never strip multiple, never
   *  append. `${base}/chat/completions` is the only URL we call. */
  private get baseUrl(): string {
    let b = this.rawBaseUrl.trim();
    while (b.endsWith("/")) b = b.slice(0, -1);
    return b;
  }

  protected endpoint(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  /**
   * Cost lookup for OpenAI-compatible endpoints. We don't know which
   * upstream the operator is proxying through (Groq, Together, a
   * self-hosted llama.cpp, etc.), so this returns 0. Admins still
   * see token counts in the usage card.
   *
   * Specific cost tables (OpenRouter / kie.ai) live on their own
   * adapters — those adapters are picked when `baseUrl` is null AND
   * the row is one of those vendors.
   */
  estimateCostUsd(_model: string, _promptTokens: number, _outputTokens: number): number {
    return 0;
  }
}
