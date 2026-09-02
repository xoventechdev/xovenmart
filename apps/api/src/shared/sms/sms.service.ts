import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { toE164BD } from "../phone/bd-phone";

/**
 * SMS provider — BulkSMSBD.
 * Wrapped behind an interface so we can swap (SSL Wireless, Infobip, etc.)
 * without touching call sites.
 */
export interface ISmsProvider {
  send(phone: string, message: string): Promise<{ ok: boolean; error?: string }>;
}

@Injectable()
export class SmsService implements ISmsProvider {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
    const apiKey = this.config.get<string>("BULKSMSBD_API_KEY");
    const senderId = this.config.get<string>("BULKSMSBD_SENDER_ID", "XovenMart");
    const baseUrl = this.config.get<string>("BULKSMSBD_BASE_URL", "https://api.bulksmsbd.com/api/v1/send");

    // Normalize to E.164 (`+880XXXXXXXXXX`) regardless of what the caller
    // passes — internal storage is canonical 11-digit local form, so we
    // accept either and emit the SMS-gateway format.
    const e164 = toE164BD(phone) || phone;

    // In dev (no API key), log to console instead of sending
    if (!apiKey || apiKey.trim() === "") {
      this.logger.warn(`[DEV SMS] To: ${e164} | Message: ${message}`);
      return { ok: true };
    }

    try {
      const url = new URL(baseUrl);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("senderid", senderId);
      url.searchParams.set("number", e164);
      url.searchParams.set("message", message);

      const response = await fetch(url.toString(), { method: "GET" });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      // BulkSMSBD returns code 200/202 for success
      const code = String(data.code ?? data.status ?? "");
      const ok = response.ok && (code === "200" || code === "202" || code === "OK");
      if (!ok) {
        this.logger.error(`BulkSMSBD send failed: ${JSON.stringify(data)}`);
        return { ok: false, error: JSON.stringify(data) };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SMS send error";
      this.logger.error(msg);
      return { ok: false, error: msg };
    }
  }

  /** Convenience method for OTP — formats message in Bangla. */
  async sendOtp(phone: string, code: string) {
    const message = `XovenMart এ আপনার OTP কোড: ${code}\n\nএই কোড ৫ মিনিটে মেয়াদ উত্তীর্ণ হবে। শেয়ার করবেন না।`;
    return this.send(phone, message);
  }

  async sendOrderConfirmation(phone: string, orderNo: string) {
    const message = `XovenMart: আপনার অর্ডার ${orderNo} গ্রহণ করা হয়েছে। শীঘ্রই ডেলিভারি দেওয়া হবে। ট্র্যাক করুন: xovenmart.com/orders/${orderNo}`;
    return this.send(phone, message);
  }

  async sendOrderStatusUpdate(phone: string, orderNo: string, statusBn: string) {
    const message = `XovenMart: অর্ডার ${orderNo} — ${statusBn}`;
    return this.send(phone, message);
  }
}
