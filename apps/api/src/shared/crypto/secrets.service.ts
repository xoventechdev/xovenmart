import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Encrypted blob — three base64-encoded parts produced by {@link SecretsService.encrypt}.
 * Each `encrypt()` call generates a fresh 12-byte IV so the same plaintext never
 * yields the same ciphertext twice. `tag` is the GCM authentication tag; a mismatch
 * during {@link SecretsService.decrypt} throws (tamper-detection).
 */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Symmetric encryption for secrets stored in the database (SMTP passwords,
 * future API keys, etc.). AES-256-GCM authenticated encryption — a 32-byte
 * key is loaded from `SMTP_ENCRYPTION_KEY` (base64-encoded).
 *
 * Why AES-256-GCM:
 * - Authenticated: tampering with the stored ciphertext fails decryption.
 * - Standard: every language / toolchain can read it; no vendor lock-in.
 * - Constant-time comparison via the GCM tag, so timing attacks are out.
 *
 * Why a custom module instead of `bcrypt`:
 * - bcrypt is one-way (can't recover the plaintext). SMTP passwords must be
 *   recoverable at send-time.
 * - Node's built-in `crypto` module is sufficient — no new dependency.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>("SMTP_ENCRYPTION_KEY");
    if (raw && raw.trim().length > 0) {
      try {
        const buf = Buffer.from(raw.trim(), "base64");
        if (buf.length === 32) {
          this.key = buf;
          this.logger.log(`SecretsService ready (AES-256-GCM, key=${buf.length}B)`);
          return;
        }
        this.logger.error(
          `SMTP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length}). ` +
            `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
        );
      } catch (e) {
        this.logger.error(`Failed to decode SMTP_ENCRYPTION_KEY: ${(e as Error).message}`);
      }
    }
    this.key = null;
    this.logger.warn(
      "SMTP_ENCRYPTION_KEY missing or invalid — encrypted-secret operations will throw. " +
        "Set it in .env to enable SMTP provider credential storage.",
    );
  }

  /** True when the service has a valid key and can encrypt / decrypt. */
  isReady(): boolean {
    return this.key !== null;
  }

  /**
   * Encrypt a UTF-8 plaintext string. Each call uses a fresh 12-byte IV.
   * Throws if no key is configured.
   */
  encrypt(plaintext: string): EncryptedSecret {
    if (!this.key) {
      throw new Error("SecretsService: SMTP_ENCRYPTION_KEY not configured");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: enc.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  }

  /**
   * Reverse of {@link encrypt}. Throws if any of the three parts were tampered
   * with (GCM auth-tag mismatch) or if no key is configured.
   */
  decrypt(secret: EncryptedSecret): string {
    if (!this.key) {
      throw new Error("SecretsService: SMTP_ENCRYPTION_KEY not configured");
    }
    if (!secret?.ciphertext || !secret?.iv || !secret?.tag) {
      throw new Error("SecretsService.decrypt: malformed encrypted blob");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(secret.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  }
}
