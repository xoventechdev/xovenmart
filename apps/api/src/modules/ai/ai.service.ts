import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, LlmProvider, LlmVendor } from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { SecretsService } from "../../shared/crypto/secrets.service";
import {
  GenerateProductCopyDto,
  CreateLlmProviderDto,
  UpdateLlmProviderDto,
} from "./ai.dto";
import {
  ProductCopyInput,
  ProductCopyLlmOutput,
  ProductCopyResult,
  buildProductCopyPrompt,
  PRODUCT_COPY_RESPONSE_SCHEMA,
} from "./prompt-templates";
import {
  applyNamePreservation,
  buildProductSlug,
} from "./name-preservation";
import { OpenAiProvider } from "./providers/openai.provider";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { OpenRouterProvider } from "./providers/openrouter.provider";
import { KieAiProvider } from "./providers/kieai.provider";
import { LlmProviderAdapter } from "./providers/provider.types";

/**
 * Public response shape for the "generate product copy" endpoint.
 * Mirrors what the form actually needs to patch into the product
 * state — no provider internals, no usage telemetry.
 */
export interface ProductCopyResponse {
  nameEn: string;
  nameBn: string;
  descriptionEn: string;
  descriptionBn: string;
  tags: string[];
  /**
   * Server-derived slug from the FINAL `nameEn` (after the preserve-
   * admin-input rule). The service always overwrites this regardless
   * of what the LLM returned.
   */
  slug: string;
  /**
   * Resolved categoryId from the LLM's `categoryName` pick. Server
   * matches case-insensitively against the categories list passed
   * in. Null if the LLM didn't pick, didn't match, or no list was
   * supplied.
   */
  categoryId: string | null;
  /**
   * LLM's unit suggestion after whitelist validation. Falls back to
   * the admin's existing unit when the LLM didn't propose one.
   */
  unit: string;
  /** Echoed back so the admin knows which row served the call. */
  providerLabel: string;
  /** The actual model the vendor charged us for (may differ from
   *  the configured one — useful for debugging prompt-cache hits). */
  model: string;
}

/** Custom 503 shape so the frontend can deep-link to settings. */
class AiNotConfiguredException extends ServiceUnavailableException {
  constructor() {
    super({
      code: "NO_PROVIDER_CONFIGURED",
      message:
        "No AI provider configured. Open Settings → AI Providers to add one.",
      settingsPath: "/admin/system/ai",
    });
  }
}

/**
 * Core orchestrator for every AI feature. Lives in one service so
 * provider resolution, cap enforcement, decryption, call, validation,
 * and usage logging all stay in lockstep — if any step changes, every
 * AI call is updated together.
 *
 * Two responsibilities split cleanly:
 *
 *   1. Provider CRUD (DB):   create / list / update / delete / set-default / test
 *   2. Generation runtime:   generateProductCopy(input, actorId)
 *
 * The runtime path resolves the active provider (DB row → env fallback
 * → 503), enforces the spend cap, decrypts the API key, calls the
 * adapter, validates the response, logs the usage event, and returns
 * a clean DTO the controller can ship straight to the form.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** Pure adapter registry. Stateless, so we cache one instance per
   *  vendor forever. OpenRouter needs per-row `appTitle`, so its
   *  factory is in `buildAdapterFor()` instead. kie.ai is stateless
   *  like OpenAI / Gemini — no per-row config — so it lives here. */
  private readonly statelessAdapters: Record<LlmVendor, LlmProviderAdapter> = {
    [LlmVendor.OPENAI]: new OpenAiProvider(),
    [LlmVendor.ANTHROPIC]: new AnthropicProvider(),
    [LlmVendor.GEMINI]: new GeminiProvider(),
    [LlmVendor.OPENROUTER]: new OpenRouterProvider(null), // overridden per-row
    [LlmVendor.KIEAI]: new KieAiProvider(),
  };

  /**
   * In-memory ring buffer of the last 20 AI generation failures.
   * Each adapter attaches an `e.cause` diagnostic blob on
   * SCHEMA_INVALID (see openai.provider.ts); we capture the timestamp,
   * provider, model, errorCode, and the full cause here so the
   * operator can hit `GET /admin/ai/debug-last-failure` from a browser
   * tab to see what the LLM actually returned — no docker access
   * required.
   *
   * Stored in process memory only — survives across requests but not
   * container restarts. That's fine for live debugging: a fresh
   * failure populates the buffer and stays long enough to grab.
   */
  private lastFailures: Array<{
    at: string;
    provider: string;
    model: string;
    errorCode: string;
    cause: any;
  }> = [];
  private static readonly LAST_FAILURES_LIMIT = 20;

  /** Record a failure into the ring buffer. Called from the catch
   *  block in generateProductCopy(). */
  private recordFailure(provider: string, model: string, errorCode: string, cause: any): void {
    this.lastFailures.push({
      at: new Date().toISOString(),
      provider,
      model,
      errorCode,
      cause: cause ?? null,
    });
    if (this.lastFailures.length > AiService.LAST_FAILURES_LIMIT) {
      this.lastFailures.splice(0, this.lastFailures.length - AiService.LAST_FAILURES_LIMIT);
    }
  }

  /** Read the failure buffer — used by the admin debug endpoint. */
  getLastFailures() {
    return [...this.lastFailures];
  }

  /** Clear the failure buffer — used by DELETE endpoint. */
  clearLastFailures(): void {
    this.lastFailures = [];
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  // ─── Provider CRUD ───────────────────────────────────────────

  async listProviders(): Promise<LlmProvider[]> {
    return this.prisma.llmProvider.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async getProvider(id: string): Promise<LlmProvider | null> {
    return this.prisma.llmProvider.findUnique({ where: { id } });
  }

  async createProvider(input: CreateLlmProviderDto, actorId: string | null): Promise<LlmProvider> {
    if (!this.secrets.isReady()) {
      throw new ServiceUnavailableException(
        "LLM_ENCRYPTION_KEY is not configured. Set it in the API .env to enable encrypted provider storage.",
      );
    }
    const encrypted = this.secrets.encrypt(input.apiKey);
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.llmProvider.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      // First provider ever: force isDefault=true so the admin
      // doesn't get NO_PROVIDER_CONFIGURED on their first generate.
      const anyRow = await tx.llmProvider.count();
      const isDefault = input.isDefault ?? (anyRow === 0);
      return tx.llmProvider.create({
        data: {
          label: input.label,
          provider: input.provider,
          model: input.model,
          apiKeyCipher: encrypted.ciphertext,
          apiKeyIv: encrypted.iv,
          apiKeyTag: encrypted.tag,
          isActive: input.isActive ?? true,
          isDefault,
          monthlyUsdCap: input.monthlyUsdCap ?? null,
          appTitle: input.appTitle ?? null,
          createdById: actorId,
        },
      });
    });
  }

  async updateProvider(id: string, patch: UpdateLlmProviderDto): Promise<LlmProvider> {
    const existing = await this.prisma.llmProvider.findUnique({ where: { id } });
    if (!existing) {
      throw new ServiceUnavailableException("Provider not found");
    }
    const data: Prisma.LlmProviderUpdateInput = {};
    if (patch.label !== undefined) data.label = patch.label;
    if (patch.model !== undefined) data.model = patch.model;
    if (patch.apiKey) {
      if (!this.secrets.isReady()) {
        throw new ServiceUnavailableException("LLM_ENCRYPTION_KEY not configured");
      }
      const encrypted = this.secrets.encrypt(patch.apiKey);
      data.apiKeyCipher = encrypted.ciphertext;
      data.apiKeyIv = encrypted.iv;
      data.apiKeyTag = encrypted.tag;
    }
    if (patch.monthlyUsdCap !== undefined) {
      data.monthlyUsdCap =
        patch.monthlyUsdCap === null ? null : patch.monthlyUsdCap;
    }
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.appTitle !== undefined) {
      data.appTitle = patch.appTitle === null ? null : patch.appTitle;
    }

    return this.prisma.$transaction(async (tx) => {
      // isDefault flip is a special transaction — must clear others.
      if (patch.isDefault === true) {
        await tx.llmProvider.updateMany({
          where: { isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
        data.isDefault = true;
      } else if (patch.isDefault === false) {
        data.isDefault = false;
      }
      return tx.llmProvider.update({ where: { id }, data });
    });
  }

  async deleteProvider(id: string): Promise<void> {
    await this.prisma.llmProvider.delete({ where: { id } });
  }

  async setDefault(id: string): Promise<LlmProvider> {
    return this.prisma.$transaction(async (tx) => {
      await tx.llmProvider.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
      return tx.llmProvider.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });
    });
  }

  /** Recent usage rows — drives the "Recent usage" card on the AI page. */
  async listRecentUsage(limit = 20) {
    return this.prisma.aiUsageEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { provider: { select: { label: true, provider: true, model: true } } },
    });
  }

  // ─── Provider resolution (DB → env) ──────────────────────────

  /**
   * Pick the active provider for a generation call.
   *
   * Order:
   *   1. The single `isDefault=true, isActive=true` DB row (if any).
   *   2. Any `isActive=true` DB row, in createdAt order.
   *   3. Env-var fallback per vendor (so dev works with no DB row at all).
   *   4. 503 NO_PROVIDER_CONFIGURED.
   *
   * Env fallback uses `LlmProvider`-shaped rows constructed in memory:
   * the SAME encryption-free path is used at call time so the adapter
   * can be the same code.
   */
  private async resolveProvider(): Promise<{
    adapter: LlmProviderAdapter;
    apiKey: string;
    model: string;
    label: string;
    row: LlmProvider | null;
  }> {
    const row =
      (await this.prisma.llmProvider.findFirst({
        where: { isDefault: true, isActive: true },
      })) ??
      (await this.prisma.llmProvider.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      }));

    if (row) {
      if (!this.secrets.isReady()) {
        throw new ServiceUnavailableException(
          "LLM_ENCRYPTION_KEY is not configured — cannot decrypt stored provider keys.",
        );
      }
      const apiKey = this.secrets.decrypt({
        ciphertext: row.apiKeyCipher,
        iv: row.apiKeyIv,
        tag: row.apiKeyTag,
      });
      return {
        adapter: this.buildAdapterFor(row),
        apiKey,
        model: row.model,
        label: row.label,
        row,
      };
    }

    // Env-var fallback — lets the API work in dev with no DB row.
    const env = this.resolveEnvFallback();
    if (!env) {
      throw new AiNotConfiguredException();
    }
    return env;
  }

  private buildAdapterFor(row: LlmProvider): LlmProviderAdapter {
    if (row.provider === LlmVendor.OPENROUTER) {
      return new OpenRouterProvider(row.appTitle);
    }
    return this.statelessAdapters[row.provider];
  }

  private resolveEnvFallback(): {
    adapter: LlmProviderAdapter;
    apiKey: string;
    model: string;
    label: string;
    row: null;
  } | null {
    const lookups: Array<{
      vendor: LlmVendor;
      envKey: string;
      defaultModel: string;
    }> = [
      { vendor: LlmVendor.OPENAI, envKey: "OPENAI_API_KEY", defaultModel: "gpt-4o-mini" },
      { vendor: LlmVendor.ANTHROPIC, envKey: "ANTHROPIC_API_KEY", defaultModel: "claude-3-5-haiku-latest" },
      { vendor: LlmVendor.GEMINI, envKey: "GEMINI_API_KEY", defaultModel: "gemini-2.5-flash" },
      { vendor: LlmVendor.OPENROUTER, envKey: "OPENROUTER_API_KEY", defaultModel: "openai/gpt-4o-mini" },
      { vendor: LlmVendor.KIEAI, envKey: "KIEAI_API_KEY", defaultModel: "gpt-4o-mini" },
    ];
    for (const { vendor, envKey, defaultModel } of lookups) {
      const key = process.env[envKey];
      if (key && key.trim().length > 0) {
        const adapter =
          vendor === LlmVendor.OPENROUTER
            ? new OpenRouterProvider(process.env.OPENROUTER_APP_TITLE ?? null)
            : this.statelessAdapters[vendor];
        return {
          adapter,
          apiKey: key.trim(),
          model: defaultModel,
          label: `${vendor} (env fallback)`,
          row: null,
        };
      }
    }
    return null;
  }

  // ─── Generation runtime ──────────────────────────────────────

  /**
   * Generate product copy from a few hints.
   *
   * Side effects: one `AiUsageEvent` row per call (success OR failure),
   * carrying token counts + a short non-PII errorCode.
   */
  async generateProductCopy(
    input: GenerateProductCopyDto,
    actorId: string,
  ): Promise<ProductCopyResponse> {
    const t0 = Date.now();

    const provider = await this.resolveProvider();

    // Cap check — only when the provider has a row + a cap set.
    if (provider.row && provider.row.monthlyUsdCap != null) {
      const spent = await this.monthlySpendUsd(provider.row.id);
      // Rough pre-flight: assume this call costs at most $0.10 worst
      // case so a tiny cap doesn't always refuse a small prompt.
      const projected = spent + 0.1;
      if (projected > Number(provider.row.monthlyUsdCap)) {
        throw new HttpException(
          {
            message:
              `Monthly spend cap reached ($${spent.toFixed(2)} of $${Number(
                provider.row.monthlyUsdCap,
              ).toFixed(2)}) for provider "${provider.row.label}". ` +
              `Raise the cap in Settings → AI Providers or wait until next month.`,
            code: "MONTHLY_CAP_REACHED",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const promptInput: ProductCopyInput = {
      nameBn: input.nameBn,
      nameEn: input.nameEn,
      descriptionBn: input.descriptionBn,
      descriptionEn: input.descriptionEn,
      categoryName: input.categoryName,
      unit: input.unit,
      brand: input.brand,
      categories: input.categories,
      unitOptions: input.unitOptions,
    };
    const { system, user } = buildProductCopyPrompt(promptInput);

    let result: ProductCopyResult | null = null;
    let errorCode: string | null = null;
    let promptTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let okFlag = false;

    try {
      const r = await provider.adapter.generateStructuredJson<ProductCopyLlmOutput>({
        apiKey: provider.apiKey,
        model: provider.model,
        system,
        user,
        jsonSchema: PRODUCT_COPY_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      });
      // Defensive re-validation — the adapter returned parseable JSON
      // but didn't run ajv. Cheap to re-check key fields here. We
      // removed `minLength`/`maxLength` from the schema because strict
      // JSON-schema mode (OpenAI / OpenRouter) rejects some of them at
      // parse time, and Anthropic ignores them. We enforce the bounds
      // ourselves here instead — the prompt tells the model the limits.
      const d = r.data;
      const nameOk = (s: any) => typeof s === "string" && s.trim().length >= 2 && s.trim().length <= 80;
      const descOk = (s: any) => typeof s === "string" && s.trim().length >= 20 && s.trim().length <= 600;
      const tagsOk =
        Array.isArray(d?.tags) &&
        d.tags.length <= 6 &&
        d.tags.every((t: any) => typeof t === "string" && t.length <= 24);
      if (
        !nameOk(d?.nameEn) ||
        !nameOk(d?.nameBn) ||
        !descOk(d?.descriptionEn) ||
        !descOk(d?.descriptionBn) ||
        !tagsOk
      ) {
        this.logger.warn(
          `AI response failed length/type validation: ` +
            `nameEn.len=${(d?.nameEn ?? "").length} ` +
            `nameBn.len=${(d?.nameBn ?? "").length} ` +
            `descriptionEn.len=${(d?.descriptionEn ?? "").length} ` +
            `descriptionBn.len=${(d?.descriptionBn ?? "").length} ` +
            `tags=${JSON.stringify(d?.tags)}`,
        );
        throw new Error("SCHEMA_INVALID");
      }
      // Coerce the parsed shape to our expected interface — adapters
      // return `unknown` and Ajv-style validation isn't wired here.
      //
      // Server-side "preserve admin input" guard. The LLM prompt asks
      // for verbatim preservation, but in practice the model still
      // collapsed multi-word Bengali names into single words (e.g.
      // "পাকা আম" → "আম"). We now enforce a word-locked rule here so
      // the wire output never drifts from what the admin typed.
      const nameEnGuard = applyNamePreservation(
        input.nameEn ?? "",
        d.nameEn,
        "en",
      );
      const nameBnGuard = applyNamePreservation(
        input.nameBn ?? "",
        d.nameBn,
        "bn",
      );

      if (nameEnGuard.rejected) {
        this.logger.warn(
          `ai.preserveAdminName.override locale=en ` +
            `input="${input.nameEn ?? ""}" llm="${d.nameEn}" ` +
            `reason=${nameEnGuard.reason}`,
        );
      }
      if (nameBnGuard.rejected) {
        this.logger.warn(
          `ai.preserveAdminName.override locale=bn ` +
            `input="${input.nameBn ?? ""}" llm="${d.nameBn}" ` +
            `reason=${nameBnGuard.reason}`,
        );
      }

      const finalNameEn = nameEnGuard.value;
      const finalNameBn = nameBnGuard.value;

      // Server-derived slug from the FINAL English name. If admin
      // typed nothing and the LLM also returned empty, buildProductSlug
      // falls back to `product-{shortId}` so the slug is always usable.
      const slug = buildProductSlug(finalNameEn);

      // Category resolution: match the LLM's `categoryName` against
      // the admin-supplied category list (case-insensitive, exact on
      // the EN path OR the BN path; the LLM is told to return one).
      let categoryId: string | null = null;
      const llmCategory = (d.categoryName ?? "").toString().trim();
      if (llmCategory && input.categories?.length) {
        const norm = (s: string) =>
          s.normalize("NFC").toLowerCase().trim();
        const llmNorm = norm(llmCategory);
        const lookup = (
          cats: { id: string; nameBn: string; nameEn: string; children?: any[] }[],
          parents: { bn: string; en: string }[],
        ): string | null => {
          for (const c of cats) {
            const bnPath = [...parents.map((p) => p.bn), c.nameBn]
              .filter(Boolean)
              .join(" › ");
            const enPath = [...parents.map((p) => p.en), c.nameEn]
              .filter(Boolean)
              .join(" › ");
            if (norm(bnPath) === llmNorm || norm(enPath) === llmNorm) {
              return c.id;
            }
            if (c.children?.length) {
              const found = lookup(
                c.children,
                [...parents, { bn: c.nameBn, en: c.nameEn }],
              );
              if (found) return found;
            }
          }
          return null;
        };
        categoryId = lookup(input.categories, []);
        if (!categoryId) {
          this.logger.warn(
            `ai.category.unmatched llm="${llmCategory}" ` +
              `(categories in input: ${input.categories.length})`,
          );
        }
      }

      // Unit whitelist: only accept the LLM's pick if it's in the
      // admin-supplied `unitOptions`. Otherwise fall back to the
      // admin's existing input.unit (so a previously-typed unit
      // survives the round-trip).
      const llmUnit = (d.unit ?? "").toString().trim();
      let resolvedUnit = input.unit ?? "";
      if (llmUnit) {
        if (!input.unitOptions || input.unitOptions.length === 0) {
          // No whitelist → keep admin's unit. Don't let the LLM pick
          // a unit value the catalog doesn't know about.
          this.logger.warn(
            `ai.unit.rejected-no-whitelist llm="${llmUnit}"`,
          );
        } else if (!input.unitOptions.includes(llmUnit)) {
          this.logger.warn(
            `ai.unit.rejected-not-in-whitelist llm="${llmUnit}" ` +
              `whitelist=${JSON.stringify(input.unitOptions)}`,
          );
        } else {
          resolvedUnit = llmUnit;
        }
      }

      result = {
        nameEn: finalNameEn,
        nameBn: finalNameBn,
        descriptionEn: d.descriptionEn.trim(),
        descriptionBn: d.descriptionBn.trim(),
        tags: (d.tags as string[]).map((t) => String(t).trim()).filter(Boolean),
        slug,
        categoryId,
        unit: resolvedUnit,
      };
      promptTokens = r.usage.promptTokens;
      outputTokens = r.usage.outputTokens;
      costUsd = provider.adapter.estimateCostUsd(
        r.model,
        promptTokens,
        outputTokens,
      );
      okFlag = true;
    } catch (e: any) {
      errorCode = String(e?.message ?? "UNKNOWN");
      // Adapter attaches a diagnostic `cause` blob on SCHEMA_INVALID
      // (see openai.provider.ts) so we can see WHY the JSON couldn't
      // be parsed without needing AI_DEBUG=1 on prod. We surface the
      // cause fingerprint in the same log line so `docker logs
      // xovenmart-api | grep AI` immediately reveals whether the
      // failure was empty content vs extract-failed vs reasoning-only.
      const cause = (e as any)?.cause;
      const causeStr = cause ? ` cause=${JSON.stringify(cause)}` : "";
      this.logger.warn(
        `AI generate-product-copy failed (provider=${provider.label}, model=${provider.model}, errorCode=${errorCode})${causeStr}`,
      );
      // Capture into the in-memory ring buffer so the operator can
      // retrieve it via GET /admin/ai/debug-last-failure without
      // needing docker access.
      this.recordFailure(provider.label, provider.model, errorCode, cause);
    }

    const durationMs = Date.now() - t0;

    // Usage event requires a provider row — env fallback has none.
    if (provider.row) {
      try {
        await this.prisma.aiUsageEvent.create({
          data: {
            providerId: provider.row.id,
            actorId,
            feature: "product_copy",
            model: provider.model,
            promptTokens,
            outputTokens,
            estimatedCostUsd: new Prisma.Decimal(costUsd.toFixed(6)),
            durationMs,
            ok: okFlag,
            errorCode: okFlag ? null : errorCode,
          },
        });
      } catch (e) {
        // Logging the usage event must NEVER block the user's call.
        this.logger.error(`failed to write AiUsageEvent: ${(e as Error).message}`);
      }
    }

    if (!okFlag || !result) {
      throw new ServiceUnavailableException({
        code: errorCode || "AI_FAILED",
        message: this.humanizeError(errorCode),
      });
    }

    return {
      nameEn: result.nameEn,
      nameBn: result.nameBn,
      descriptionEn: result.descriptionEn,
      descriptionBn: result.descriptionBn,
      tags: result.tags,
      slug: result.slug,
      categoryId: result.categoryId,
      unit: result.unit,
      providerLabel: provider.label,
      model: provider.model,
    };
  }

  // ─── Test connection ─────────────────────────────────────────

  /**
   * Send a tiny "ping" call to verify the provider + key are live.
   * Cheaper than a full generate: max_tokens=16, simplest possible
   * user message, schema stripped (the ping just needs *some*
   * JSON-shaped response).
   */
  async testProvider(id: string): Promise<{
    ok: boolean;
    errorCode?: string;
    model: string;
    durationMs: number;
  }> {
    const t0 = Date.now();
    const row = await this.prisma.llmProvider.findUnique({ where: { id } });
    if (!row) {
      throw new ServiceUnavailableException("Provider not found");
    }
    if (!this.secrets.isReady()) {
      throw new ServiceUnavailableException("LLM_ENCRYPTION_KEY not configured");
    }
    const apiKey = this.secrets.decrypt({
      ciphertext: row.apiKeyCipher,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    });
    const adapter = this.buildAdapterFor(row);
    try {
      const r = await adapter.generateStructuredJson<{ ok: true }>({
        apiKey,
        model: row.model,
        system: "You are a connectivity test. Reply with JSON.",
        user: 'Return exactly {"ok": true}.',
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
        temperature: 0,
        maxOutputTokens: 16,
        timeoutMs: 10_000,
      });
      return {
        ok: true,
        model: r.model,
        durationMs: Date.now() - t0,
      };
    } catch (e: any) {
      return {
        ok: false,
        errorCode: String(e?.message ?? "UNKNOWN"),
        model: row.model,
        durationMs: Date.now() - t0,
      };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private async monthlySpendUsd(providerId: string): Promise<number> {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const agg = await this.prisma.aiUsageEvent.aggregate({
      where: {
        providerId,
        ok: true,
        createdAt: { gte: since },
      },
      _sum: { estimatedCostUsd: true },
    });
    const sum = agg._sum.estimatedCostUsd;
    return sum ? Number(sum) : 0;
  }

  private humanizeError(code: string | null): string {
    switch (code) {
      case "401":
        return "Provider rejected the API key (401). Check the key in Settings → AI Providers.";
      case "403":
        return "Provider refused the request (403). The model may not be enabled on your account.";
      case "404":
        return "Provider returned 404 — the configured model id may be wrong.";
      case "429":
        return "Provider rate-limited the call (429). Try again in a minute, or set a different provider as default.";
      case "TIMEOUT":
        return "Provider timed out. Try again or switch to a different provider.";
      case "NETWORK":
        return "Network error reaching the provider. Check connectivity and try again.";
      case "SCHEMA_REJECTED":
        return "The provider rejected the response schema. The configured model may not support structured output for this feature — try a different model (e.g. gpt-4o-mini, claude-3-5-haiku-latest, gemini-2.5-flash).";
      case "REFUSAL":
        return "The provider refused this request as a policy violation. Try rewording the existing draft (name/description) and click ✨ again.";
      case "SCHEMA_INVALID":
        return "Provider returned a malformed response — try a different model.";
      default:
        return "AI call failed. Try again, or open Settings → AI Providers to check the configuration.";
    }
  }
}
