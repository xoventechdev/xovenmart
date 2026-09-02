"use client";

import { MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";
import { useTwin } from "@/lib/i18n";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";

interface CardData {
  icon: React.ReactNode;
  titleBn: string;
  titleEn: string;
  contentBn: string;
  contentEn: string;
  href?: string;
  wide?: boolean;
}

export function ContactView() {
  const tw = useTwin();
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();
  const mins = delivery.minutes;
  const promiseBn = delivery.labelBn.replace(/\d+/g, String(mins));
  const promiseEn = delivery.labelEn.replace(/\d+/g, String(mins));
  // Office address — admin-editable in General Settings; falls back to
  // the delivery-zone-derived address when admin hasn't set it.
  const officeBn =
    delivery.zones.length > 0 && !general.store.addressBn.includes("Mudafarganj")
      ? `মুদাফরগঞ্জ বাজার, ${delivery.zones[0].nameBn}`
      : general.store.addressBn;
  const officeEn =
    delivery.zones.length > 0 && !general.store.addressEn.includes("Mudafarganj")
      ? `Mudafarganj Bazar, ${delivery.zones[0].nameEn}`
      : general.store.addressEn;

  // WhatsApp link is the same number as the store phone — strip + and spaces.
  const phoneDigits = general.store.phone.replace(/[^0-9]/g, "");

  const cards: CardData[] = [
    {
      icon: <MapPin className="h-6 w-6 text-primary" />,
      titleBn: "অফিস ঠিকানা",
      titleEn: "Office address",
      contentBn: officeBn,
      contentEn: officeEn,
    },
    {
      icon: <Phone className="h-6 w-6 text-primary" />,
      titleBn: "ফোন",
      titleEn: "Phone",
      contentBn: general.store.phone,
      contentEn: general.store.phone,
      href: `tel:${phoneDigits}`,
    },
    {
      icon: <Mail className="h-6 w-6 text-primary" />,
      titleBn: "ইমেইল",
      titleEn: "Email",
      contentBn: general.store.email,
      contentEn: general.store.email,
      href: `mailto:${general.store.email}`,
    },
    {
      icon: <MessageCircle className="h-6 w-6 text-primary" />,
      titleBn: "WhatsApp",
      titleEn: "WhatsApp",
      contentBn: general.store.phone,
      contentEn: general.store.phone,
      href: `https://wa.me/${phoneDigits}`,
    },
    {
      icon: <Clock className="h-6 w-6 text-primary" />,
      titleBn: "কর্মঘণ্টা",
      titleEn: "Working hours",
      contentBn: "সকাল ৮টা — রাত ১০টা (প্রতিদিন)",
      contentEn: "8 AM — 10 PM (every day)",
      wide: true,
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-8">
        <MessageCircle className="h-10 w-10 text-primary mx-auto mb-2" />
        <h1 className="text-3xl font-bold">{tw("যোগাযোগ", "Contact")}</h1>
        <p className="text-muted-foreground mt-1">
          {tw(
            "আমাদের সাথে যেকোনো প্রয়োজনে যোগাযোগ করুন",
            "Reach out to us for anything you need",
          )}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {cards.map((c, i) => (
          <ContactCard key={i} card={c} />
        ))}
      </div>

      <div className="mt-10 p-6 bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800">
        <h2 className="font-bold mb-2">
          {tw("আমাদের কাছে মেসেজ পাঠান", "Send us a message")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {tw(
            `যেকোনো প্রশ্ন বা অভিযোগের জন্য সরাসরি কল করুন বা WhatsApp-এ মেসেজ করুন। আমরা ${promiseBn} উত্তর দেওয়ার চেষ্টা করি।`,
            `Call us directly or message on WhatsApp for any question or complaint. We try to reply ${promiseEn.replace(/^30-?min\s*/i, "within " + mins + "-min ")}.`,
          )}
        </p>
        <a
          href={`https://wa.me/${phoneDigits}?text=Hello%20${encodeURIComponent(general.store.nameEn)}%2C%20I%20need%20help%20with...`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
        >
          <MessageCircle className="h-4 w-4" />
          {tw("WhatsApp-এ চ্যাট করুন", "Chat on WhatsApp")}
        </a>
      </div>
    </div>
  );
}

function ContactCard({ card }: { card: CardData }) {
  const { lang } = useThemeSafe();
  const title = lang === "en" ? card.titleEn : card.titleBn;
  const body = lang === "en" ? card.contentEn : card.contentBn;

  return (
    <div
      className={`bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5 ${card.wide ? "md:col-span-2" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">{card.icon}</div>
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="font-semibold mt-0.5">
            {card.href ? (
              <a href={card.href} className="hover:text-primary" target={card.href.startsWith("http") ? "_blank" : undefined} rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}>
                {body}
              </a>
            ) : (
              body
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useTheme as _useTheme } from "@/lib/theme";
function useThemeSafe() {
  try {
    return _useTheme();
  } catch {
    return { lang: "bn" as const };
  }
}