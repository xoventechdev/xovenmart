import { Injectable, Logger } from "@nestjs/common";
import { EmailPurpose, Prisma } from "@prisma/client";
import { PrismaService } from "../../shared/prisma/prisma.module";

export type TemplateChannel = "email" | "sms" | "push";
export type TemplateCategory =
  | "orders"
  | "auth"
  | "referral"
  | "admin"
  | "backup"
  | "marketing";
export type TemplateLocale = "bn" | "en";

export interface VariableSpec {
  name: string;
  type?: "string" | "number" | "currency" | "url" | "phone";
  required?: boolean;
  sample?: string;
  label?: string;
}

export interface TemplateRow {
  key: string;
  channel: TemplateChannel;
  name: string;
  category: TemplateCategory;
  description?: string;
  emailPurpose?: EmailPurpose | null;
  variables: VariableSpec[];
  subjectEn?: string;
  subjectBn?: string;
  bodyEn: string;
  bodyBn?: string;
  htmlBodyEn?: string;
  htmlBodyBn?: string;
  updatedAt?: Date;
  updatedBy?: string | null;
  /** True if this row is staged (no business logic triggers it yet). */
  staged?: boolean;
}

export interface RenderedTemplate {
  subject?: string;
  body: string;
  html?: string;
}

/**
 * Centralized template renderer. Templates live as `AppSetting` rows with
 * key `template.<channel>.<name>` (no migration needed). Storage shape is
 * bilingual so the admin UI can edit EN + BN side-by-side, and send-time
 * picks the recipient locale via `resolveLocale(userId)`.
 *
 * Backward-compatible: legacy `{ subject, body, variables }` rows are
 * still readable and treated as English-only (`subjectEn`/`bodyEn`).
 *
 * Cache: a small `templatesCache` Map keyed by `template.*`. Invalidated
 * whenever an admin upserts a template (called from
 * `TemplatesService.invalidateCache`, which `AdminTemplatesController`
 * invokes on PUT/DELETE).
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);
  private cache: Map<string, TemplateRow> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Cache control — called from the controller on write paths. */
  invalidateCache() {
    this.cache = null;
  }

  // ───────────────────────────────────────────────────────────────
  // Lookup
  // ───────────────────────────────────────────────────────────────

  /** Return raw row from DB (or null if not present). */
  async find(channel: TemplateChannel, name: string): Promise<TemplateRow | null> {
    if (this.cache) {
      const cached = this.cache.get(this.keyFor(channel, name));
      if (cached) return cached;
    }
    const row = await this.prisma.appSetting.findUnique({
      where: { key: this.keyFor(channel, name) },
    });
    if (!row) return null;
    const parsed = this.parseRow(channel, name, row.value, row.updatedAt, row.updatedBy);
    if (!this.cache) this.cache = new Map();
    this.cache.set(parsed.key, parsed);
    return parsed;
  }

  /**
   * Look up the row, or synthesize a stub from a built-in literal map.
   * Guarantees we always have *something* to render even when admin has
   * deleted a row — the previous hard-coded fallback behavior.
   */
  async findOrInherit(channel: TemplateChannel, name: string): Promise<TemplateRow> {
    const found = await this.find(channel, name);
    if (found) return found;
    const inherited = this.inheritLiteral(channel, name);
    if (inherited) return inherited;
    // Final fallback: empty template (render() will return "(no template)").
    return {
      key: this.keyFor(channel, name),
      channel,
      name,
      category: this.guessCategory(name),
      bodyEn: "(no template)",
      variables: [],
    };
  }

  /** Load every template row from the DB (no inheritance). */
  async listAll(): Promise<TemplateRow[]> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { startsWith: "template." } },
      orderBy: { key: "asc" },
    });
    return rows.map((row) =>
      this.parseRow(
        this.extractChannel(row.key) ?? "email",
        this.extractName(row.key) ?? row.key,
        row.value,
        row.updatedAt,
        row.updatedBy,
      ),
    );
  }

  // ───────────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────────

  /**
   * Apply variable substitution to one text string.
   * `{{varName}}` → `String(vars[name])` (empty string if undefined).
   */
  applyVariables(text: string, vars: Record<string, unknown> | undefined): string {
    if (!text) return "";
    return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k: string) => {
      const v = vars?.[k];
      return v === undefined || v === null ? "" : String(v);
    });
  }

  /** Extract all `{{var}}` references from a template body/subject. */
  extractVariables(text: string): string[] {
    if (!text) return [];
    const out = new Set<string>();
    const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
    return [...out];
  }

  /**
   * Render a row against the given locale + variables.
   * Locale fallback chain: requested → opposite → literal → "(no template)".
   */
  render(row: TemplateRow, vars: Record<string, unknown>, locale: TemplateLocale): RenderedTemplate {
    const subjectPair = this.pair(row.subjectEn, row.subjectBn, locale);
    const bodyPair = this.pair(row.bodyEn, row.bodyBn, locale);
    const htmlPair = this.pair(row.htmlBodyEn, row.htmlBodyBn, locale);

    const subject = row.channel === "email" && subjectPair
      ? this.applyVariables(subjectPair, vars)
      : undefined;
    const body = this.applyVariables(bodyPair || "(no template)", vars);
    const html = htmlPair ? this.applyVariables(htmlPair, vars) : undefined;

    return { subject, body, html };
  }

  /** Convenience: fetch + render an email template. */
  async renderEmail(
    channel: "email",
    name: string,
    vars: Record<string, unknown>,
    locale: TemplateLocale,
  ): Promise<RenderedTemplate & { emailPurpose?: EmailPurpose | null }> {
    const row = await this.findOrInherit(channel, name);
    const rendered = this.render(row, vars, locale);
    return { ...rendered, emailPurpose: row.emailPurpose ?? null };
  }

  /** Convenience: fetch + render an SMS template (no subject). */
  async renderSms(
    name: string,
    vars: Record<string, unknown>,
    locale: TemplateLocale,
  ): Promise<RenderedTemplate> {
    const row = await this.findOrInherit("sms", name);
    return this.render(row, vars, locale);
  }

  /** Convenience: fetch + render a push template (stub channel). */
  async renderPush(
    name: string,
    vars: Record<string, unknown>,
    locale: TemplateLocale,
  ): Promise<RenderedTemplate> {
    const row = await this.findOrInherit("push", name);
    return this.render(row, vars, locale);
  }

  // ───────────────────────────────────────────────────────────────
  // Locale resolution
  // ───────────────────────────────────────────────────────────────

  /**
   * Resolve recipient locale. The codebase stores the recipient's preferred
   * language as the `defaultLanguage` app setting (one per locale, defaulting
   * to "bn"). Per-user locale override does not exist yet on the User model,
   * so we read the site-wide setting. When the schema grows a per-user
   * locale column, that lookup goes here ahead of the app setting.
   */
  async resolveLocale(userId?: string | null): Promise<TemplateLocale> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: "defaultLanguage" },
    });
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        if (parsed === "en" || parsed === "bn") return parsed;
      } catch {
        // ignore
      }
    }
    // userId reserved for future per-user locale column.
    void userId;
    return "bn";
  }

  // ───────────────────────────────────────────────────────────────
  // Validation
  // ───────────────────────────────────────────────────────────────

  /**
   * Validate a row before save. Returns `{ errors, warnings }`.
   * Caller decides whether `errors` should block the PUT.
   */
  validateRow(row: Pick<TemplateRow, "channel" | "bodyEn" | "subjectEn" | "variables"> & Partial<TemplateRow>): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (row.channel === "email") {
      if (!row.subjectEn || row.subjectEn.trim().length === 0) {
        errors.push("Email templates require subjectEn");
      }
      if (!row.bodyEn || row.bodyEn.trim().length === 0) {
        errors.push("Email templates require bodyEn");
      }
    } else {
      if (!row.bodyEn || row.bodyEn.trim().length === 0) {
        errors.push("Templates require bodyEn");
      }
    }

    const declared = new Set((row.variables ?? []).map((v) => v.name));
    const referenced = new Set<string>();
    for (const text of [row.subjectEn, row.bodyEn, row.subjectBn, row.bodyBn, row.htmlBodyEn, row.htmlBodyBn]) {
      if (!text) continue;
      for (const name of this.extractVariables(text)) referenced.add(name);
    }
    for (const name of referenced) {
      if (!declared.has(name)) {
        warnings.push(`Unknown variable {{${name}}} referenced in template`);
      }
    }
    for (const v of row.variables ?? []) {
      if (!referenced.has(v.name)) {
        warnings.push(`Declared variable {{${v.name}}} is never used in the template`);
      }
      if (v.required) {
        if (!referenced.has(v.name)) {
          warnings.push(`Required variable {{${v.name}}} must appear in body or subject`);
        }
      }
    }

    return { errors, warnings };
  }

  // ───────────────────────────────────────────────────────────────
  // Internal helpers
  // ───────────────────────────────────────────────────────────────

  private keyFor(channel: TemplateChannel, name: string): string {
    return `template.${channel}.${name}`;
  }

  private extractChannel(key: string): TemplateChannel | null {
    if (!key.startsWith("template.")) return null;
    const rest = key.slice("template.".length);
    const dot = rest.indexOf(".");
    if (dot < 0) return null;
    const c = rest.slice(0, dot);
    if (c === "email" || c === "sms" || c === "push") return c;
    return null;
  }

  private extractName(key: string): string | null {
    if (!key.startsWith("template.")) return null;
    const rest = key.slice("template.".length);
    const dot = rest.indexOf(".");
    if (dot < 0) return null;
    return rest.slice(dot + 1);
  }

  private parseRow(
    channel: TemplateChannel,
    name: string,
    raw: string,
    updatedAt?: Date,
    updatedBy?: string | null,
  ): TemplateRow {
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { body: raw };
    }

    // Backward-compat: legacy { subject, body, variables } maps to *En.
    const subjectEn = parsed.subjectEn ?? parsed.subject;
    const bodyEn = parsed.bodyEn ?? parsed.body ?? "";
    const variables: VariableSpec[] = Array.isArray(parsed.variables)
      ? parsed.variables.map((v: any) =>
          typeof v === "string"
            ? { name: v, type: "string", required: true }
            : { type: "string", required: true, ...v },
        )
      : [];

    return {
      key: this.keyFor(channel, name),
      channel,
      name,
      category: (parsed.category as TemplateCategory) ?? this.guessCategory(name),
      description: parsed.description,
      emailPurpose: (parsed.emailPurpose as EmailPurpose | null | undefined) ?? null,
      variables,
      subjectEn,
      subjectBn: parsed.subjectBn,
      bodyEn,
      bodyBn: parsed.bodyBn,
      htmlBodyEn: parsed.htmlBodyEn,
      htmlBodyBn: parsed.htmlBodyBn,
      updatedAt,
      updatedBy: updatedBy ?? null,
      staged: parsed.staged === true,
    };
  }

  private pair(en: string | undefined, bn: string | undefined, locale: TemplateLocale): string {
    if (locale === "en") {
      if (en && en.trim()) return en;
      if (bn && bn.trim()) return bn;
      return "";
    }
    if (bn && bn.trim()) return bn;
    if (en && en.trim()) return en;
    return "";
  }

  private guessCategory(name: string): TemplateCategory {
    if (name.startsWith("order_")) return "orders";
    if (name === "otp" || name === "welcome") return "auth";
    if (name.startsWith("referral_")) return "referral";
    if (name.startsWith("admin_")) return "admin";
    if (name.startsWith("backup_")) return "backup";
    if (name === "deal_alert" || name === "abandoned_cart") return "marketing";
    return "orders";
  }

  /**
   * Fallback literals for the 6 original builtins — preserves legacy
   * behavior (English-only, generic copy) if an admin ever deletes a row.
   */
  private inheritLiteral(channel: TemplateChannel, name: string): TemplateRow | null {
    const LITERALS: Record<string, { subjectEn?: string; bodyEn: string }> = {
      "email.order_placed": {
        subjectEn: "Order {{orderNo}} confirmed",
        bodyEn:
          "Hi {{customerName}},\n\nThanks for shopping at XovenMart. Your order {{orderNo}} has been received.\n\nTotal: ৳{{total}}\nDelivery to: {{address}}\n\nTrack your order: {{url}}\n\n— XovenMart Team",
      },
      "email.order_shipped": {
        subjectEn: "Your order {{orderNo}} is on the way",
        bodyEn:
          "Hi {{customerName}},\n\nGreat news — your order {{orderNo}} is out for delivery with rider {{riderName}} ({{riderPhone}}).\n\nTrack: {{url}}\n\n— XovenMart Team",
      },
      "email.order_delivered": {
        subjectEn: "Order {{orderNo}} delivered",
        bodyEn:
          "Hi {{customerName}},\n\nYour order {{orderNo}} has been delivered. We hope you enjoyed the experience.\n\nRate your order: {{reviewUrl}}\n\n— XovenMart Team",
      },
      "sms.order_placed": {
        bodyEn: "Your XovenMart order {{orderNo}} is confirmed. Total: ৳{{total}}. Track: {{url}}",
      },
      "sms.otp": {
        bodyEn: "Your XovenMart OTP is {{code}}. Valid for {{minutes}} minutes.",
      },
      "push.order_status": {
        bodyEn: "Order {{orderNo}} - {{status}}",
      },
    };
    const k = `${channel}.${name}`;
    const lit = LITERALS[k];
    if (!lit) return null;
    return {
      key: this.keyFor(channel, name),
      channel,
      name,
      category: this.guessCategory(name),
      bodyEn: lit.bodyEn,
      subjectEn: lit.subjectEn,
      variables: this.extractVariables(`${lit.subjectEn ?? ""} ${lit.bodyEn}`).map((n) => ({
        name: n,
        type: "string",
        required: true,
      })),
    };
  }
}
