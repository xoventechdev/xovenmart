"use client";

import { useEffect, useState } from "react";
import { Headphones, Phone, MessageCircle, Sparkles, X, ChevronRight } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";

/**
 * Floating "Support" action button + popover. Mounted once at the
 * public-site layout level (`apps/web/app/(public)/layout.tsx`) so it
 * floats above every public page except the admin area.
 *
 * Layout model borrowed from a popular BD shop style — circular FAB
 * with ping animation, anchored bottom-right, opens a small card with
 * one tap per contact channel. Brand has been retuned to XovenMart's
 * navy primary palette so it doesn't clash with the rest of the site.
 *
 * "Open by default" on first visit, dismissible with the X button.
 * State stays local — we don't persist "dismissed" so the user can
 * reopen any time by tapping the FAB again. If we ever want to
 * auto-collapse after N seconds, add a sessionStorage flag here.
 *
 * Channels:
 *   - Voice call → `tel:` link using admin-configured `contact.phoneTel`
 *   - WhatsApp   → `https://wa.me/<digits>` link using `contact.whatsapp`
 *                  (no "+", no "@"). Empty string means the tile is
 *                  hidden entirely.
 *   - Both numbers come from admin General Settings so updating them
 *     doesn't require a redeploy.
 */
export function SupportFab() {
  const { lang } = useTheme();
  const tw = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const general = useGeneralSettingsSafe();
  const c = general.contact;

  // Start CLOSED. The FAB sits in the bottom-right corner and opens
  // its popover only when the user taps it. Earlier versions opened
  // by default, which covered page content on first paint and felt
  // pushy. The persistent ping animation on the FAB already signals
  // that there's something to interact with, so visitors know it's
  // there even when the card is hidden.
  const [open, setOpen] = useState(false);

  // If `lang` toggles, no-op. We keep no other side-effects here.
  useEffect(() => {
    /* no-op — reserved for future dismiss-persistence */
  }, []);

  // Strip non-digits to build a clean wa.me href. wa.me expects just
  // digits (e.g. "8801720694513"). The contact.whatsapp field already
  // strips "+" server-side, but defense-in-depth on the client too.
  const waDigits = (c.whatsapp || "").replace(/[^\d]/g, "");
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
        tw(
          "হ্যালো XovenMart, আমি অর্ডার সম্পর্কে সহায়তা চাই।",
          "Hello XovenMart, I need help with my order.",
        ),
      )}`
    : "";

  // Skip rendering the WhatsApp tile only if the admin explicitly set
  // an empty value. If they only set a phone and not whatsapp, the
  // backend fallback gives us a usable number.
  const showWhatsApp = !!waHref;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 select-none">
      {/* Popover card — sits above the FAB when open */}
      {open && (
        <div className="absolute bottom-16 right-0 w-[310px] sm:w-[340px] bg-white/95 dark:bg-ink-900 backdrop-blur-md rounded-3xl border border-ink-100 dark:border-ink-700 shadow-2xl p-5 mb-2 animate-in fade-in slide-in-from-bottom-5 duration-200 text-ink-900 dark:text-ink-50 overflow-hidden">
          {/* Soft glow blob — purely decorative */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100/40 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

          <div className="flex items-start justify-between relative z-10 pb-3 border-b border-ink-100 dark:border-ink-700">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary-700 to-primary-500 dark:from-primary-800 dark:to-primary-600 text-white flex items-center justify-center shadow-md shadow-primary-500/20">
                  <Headphones className="w-5 h-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success-500 border-2 border-white rounded-full animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-black text-ink-900 flex items-center gap-1.5">
                  {tw("২৪/৭ লাইভ সাপোর্ট", "24/7 Live Support")}
                  <Sparkles className="w-3.5 h-3.5 text-warning-500" />
                </h4>
                <p className="text-[10px] text-ink-500 font-bold">
                  {tw(
                    "ঝটপট কাস্টমার হেল্পডেস্ক",
                    "Quick customer helpdesk",
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-xl bg-ink-100 hover:bg-ink-200 text-ink-500 hover:text-ink-900 dark:bg-ink-800 dark:hover:bg-ink-700 dark:text-ink-200 dark:hover:text-white flex items-center justify-center transition-colors text-xs font-black"
              title={tw("বন্ধ করুন", "Close")}
              aria-label={tw("বন্ধ করুন", "Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-ink-500 dark:text-ink-200 font-medium my-3 leading-relaxed">
            {tw(
              "অর্ডার, ডেলিভারি বা যেকোনো প্রয়োজনে আমাদের সাথে সরাসরি কথা বলুন:",
              "Talk to us directly about your order, delivery, or anything else:",
            )}
          </p>

          <div className="space-y-2.5">
            {/* Call tile — uses primary navy brand color */}
            {c.phoneTel && (
              <a
                href={`tel:${c.phoneTel.replace(/[^\d+]/g, "")}`}
                className="group flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900 dark:to-primary-800 hover:from-primary-100 hover:to-primary-200 dark:hover:from-primary-800 dark:hover:to-primary-700 border border-primary-200/80 text-primary-800 dark:text-primary-100 transition-all shadow-xs active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-700 text-white flex items-center justify-center shadow-sm">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black block">
                      {tw("সরাসরি কল করুন", "Call us now")}
                    </span>
                    <span className="text-[10px] font-bold text-ink-500 dark:text-ink-300 font-mono">
                      {c.phoneDisplay}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-primary-700 dark:text-ink-50 group-hover:translate-x-0.5 transition-transform" />
              </a>
            )}

            {/* WhatsApp tile — keeps its native green since that's the
                globally recognized WhatsApp brand cue */}
            {showWhatsApp && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-success-50 to-success-100 dark:from-emerald-900 dark:to-emerald-800 hover:from-success-100 hover:to-success-200 dark:hover:from-emerald-800 dark:hover:to-emerald-700 border border-success-200/80 dark:border-emerald-700 text-success-700 dark:text-emerald-100 transition-all shadow-xs active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center shadow-sm">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black block text-success-700">
                      {tw(
                        "হোয়াটসঅ্যাপ চ্যাট",
                        "WhatsApp Chat",
                      )}
                    </span>
                    <span className="text-[10px] font-bold text-success-700/80">
                      {tw(
                        "ক্লিক করে ইনস্ট্যান্ট মেসেজ দিন",
                        "Tap to send us a message",
                      )}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-success-700 group-hover:translate-x-0.5 transition-transform" />
              </a>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-ink-100 dark:border-ink-700 text-center">
            <span className="text-[10px] text-ink-500 font-bold flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full" />
              {tw(
                "আমাদের প্রতিনিধিরা লাইভ সহায়তা দিতে প্রস্তুত",
                "Our team is ready to help",
              )}
            </span>
          </div>
        </div>
      )}

      {/* The FAB itself. When the popover is open, X icon; when closed,
          a single chat-bubble icon so the user can reopen. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex items-center justify-center bg-gradient-to-r from-primary-700 to-primary-500 dark:from-primary-800 dark:to-primary-700 hover:from-primary-800 hover:to-primary-600 dark:hover:from-primary-700 dark:hover:to-primary-600 text-white p-3 sm:p-3.5 rounded-full shadow-lg shadow-primary-500/30 dark:shadow-primary-900/40 transition-all duration-200 active:scale-95 border-2 border-white/80 dark:border-primary-700/60"
        aria-label={
          open
            ? tw("সাপোর্ট মেনু বন্ধ করুন", "Close support menu")
            : tw("কাস্টমার সাপোর্ট", "Customer support")
        }
      >
        <span className="absolute -inset-1 rounded-full bg-primary-500/30 animate-ping pointer-events-none opacity-75" />
        <span className="relative z-10 flex items-center gap-2">
          {open ? (
            <X className="w-5 h-5" />
          ) : (
            <Headphones className="w-5 h-5" />
          )}
        </span>
      </button>
    </div>
  );
}
