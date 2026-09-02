"use client";

import { useState } from "react";
import { Check, Copy, Facebook, MessageCircle, Send, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/lib/theme";

/**
 * Small client component that builds deep-link share buttons (WhatsApp,
 * Facebook, SMS) plus a clipboard-copy fallback. Used inside the
 * `/account/referrals` hero card. Stateless — parent owns the open/close
 * state via the `open` prop.
 *
 * All deep links use `encodeURIComponent` so non-ASCII (৳50, বাংলা) doesn't
 * break the URL on the receiving end.
 */
export function SharePopover({
  open,
  onClose,
  shareUrl,
  shareMessage,
}: {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  shareMessage: string;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t("লিংক কপি হয়েছে", "Link copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("কপি ব্যর্থ", "Copy failed"));
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const smsHref = `sms:?body=${encodeURIComponent(shareMessage)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-ink-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-900">
            {t("শেয়ার করুন", "Share invite")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-xs break-all dark:border-ink-300 dark:bg-ink-200">
          {shareUrl}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-md bg-success-700 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-success-800"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <a
            href={smsHref}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white transition hover:bg-primary-800"
          >
            <Smartphone className="h-4 w-4" />
            SMS
          </a>
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-md bg-info-700 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-info-800"
          >
            <Facebook className="h-4 w-4" />
            Facebook
          </a>
          <button
            type="button"
            onClick={copy}
            className="flex items-center justify-center gap-2 rounded-md border border-ink-300 bg-white px-3 py-2.5 text-sm font-medium text-ink-900 transition hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-200 dark:hover:bg-ink-300"
          >
            {copied ? <Check className="h-4 w-4 text-success-700" /> : <Copy className="h-4 w-4" />}
            {copied ? t("কপি হয়েছে", "Copied") : t("লিংক কপি", "Copy link")}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-ink-500">
          {t(
            "বন্ধু সাইনআপ করলে আপনারা দুজনেই ৳50 ছাড় পাবেন",
            "When your friend signs up, you both get ৳50 off your next order.",
          )}
        </p>
      </div>
    </div>
  );
}
