"use client";

import { HelpCircle } from "lucide-react";
import { useTwin } from "@/lib/i18n";

interface FAQItem {
  qBn: string;
  qEn: string;
  aBn: string;
  aEn: string;
}

const FAQ: FAQItem[] = [
  {
    qBn: "ডেলিভারি কত সময়ে হবে?",
    qEn: "How long does delivery take?",
    aBn: "মুদাফরগঞ্জ, লাকসাম ও আশেপাশের এলাকায় সাধারণত ৩০ থেকে ৬০ মিনিটের মধ্যে ডেলিভারি দেওয়া হয়। কুমিল্লা সদরে ১-২ ঘণ্টা লাগতে পারে।",
    aEn: "Delivery is usually within 30–60 minutes in Mudafarganj, Laksam and surrounding areas. Cumilla Sadar may take 1–2 hours.",
  },
  {
    qBn: "কোন কোন পেমেন্ট পদ্ধতি গ্রহণযোগ্য?",
    qEn: "Which payment methods are accepted?",
    aBn: "এখন আমরা ক্যাশ অন ডেলিভারি (COD) গ্রহণ করি। শীঘ্রই bKash ও Nagad যুক্ত হবে।",
    aEn: "We currently accept Cash on Delivery (COD). bKash and Nagad are coming soon.",
  },
  {
    qBn: "মিনিমাম অর্ডার কত?",
    qEn: "What's the minimum order?",
    aBn: "মিনিমাম অর্ডার ৳১০০। এর কম হলে ডেলিভারি চার্জ বেশি হতে পারে।",
    aEn: "Minimum order is ৳100. Below that, delivery charge may be higher.",
  },
  {
    qBn: "ডেলিভারি চার্জ কত?",
    qEn: "How much is the delivery charge?",
    aBn: "এলাকাভেদে ৳৩০ থেকে ৳১০০ পর্যন্ত। ৳১০০০ বা তার বেশি অর্ডারে নির্দিষ্ট এলাকায় ফ্রি ডেলিভারি।",
    aEn: "Between ৳30 and ৳100 depending on area. Orders ≥ ৳1000 get free delivery in select areas.",
  },
  {
    qBn: "পণ্য ফেরত দেওয়া যাবে?",
    qEn: "Can I return a product?",
    aBn: "হ্যাঁ। পণ্য গ্রহণের সময় যাচাই করুন। সমস্যা থাকলে ২৪ ঘণ্টার মধ্যে +৮৮০১৭১০০০০০০০ নম্বরে যোগাযোগ করুন।",
    aEn: "Yes. Inspect the product on receipt. If there's a problem, contact +8801710000000 within 24 hours.",
  },
  {
    qBn: "রিফান্ড কিভাবে পাব?",
    qEn: "How do I get a refund?",
    aBn: "রিটার্ন পণ্য গ্রহণের পর ২-৩ কর্মদিবসের মধ্যে রিফান্ড প্রক্রিয়া হয়। COD হলে বিকাশ/নগদে পাঠানো হয়।",
    aEn: "Refunds are processed within 2–3 business days after the returned product is received. COD orders are refunded via bKash/Nagad.",
  },
  {
    qBn: "অর্ডার কিভাবে ট্র্যাক করব?",
    qEn: "How do I track my order?",
    aBn: "হেডারে 'অর্ডার ট্র্যাক' বাটনে ক্লিক করুন অথবা /track পেজে গিয়ে অর্ডার নম্বর দিন।",
    aEn: "Click the 'Track Order' button in the header, or go to /track and enter your order number.",
  },
  {
    qBn: "কোন এলাকায় ডেলিভারি দেওয়া হয়?",
    qEn: "Which areas do you deliver to?",
    aBn: "মুদাফরগঞ্জ, লাকসাম, কুমিল্লা সদর, চাঁদপুর সদর এবং আশেপাশের গ্রামীণ এলাকা।",
    aEn: "Mudafarganj, Laksam, Cumilla Sadar, Chandpur Sadar, and surrounding rural areas.",
  },
  {
    qBn: "অর্ডার বাতিল করতে পারব?",
    qEn: "Can I cancel my order?",
    aBn: "হ্যাঁ, অর্ডার কনফার্ম হওয়ার আগে যোগাযোগ করলে বাতিল করা যাবে।",
    aEn: "Yes — contact us before the order is confirmed and we'll cancel it.",
  },
  {
    qBn: "রাতের বেলা অর্ডার করা যাবে?",
    qEn: "Can I order at night?",
    aBn: "আমরা সকাল ৮টা থেকে রাত ১০টা পর্যন্ত অর্ডার গ্রহণ করি।",
    aEn: "We accept orders from 8 AM to 10 PM.",
  },
];

export function FaqView() {
  const { lang } = useThemeSafe();
  const tw = useTwin();

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="text-center mb-8">
        <HelpCircle className="h-10 w-10 text-primary mx-auto mb-2" />
        <h1 className="text-3xl font-bold">{tw("প্রশ্নোত্তর", "FAQ")}</h1>
        <p className="text-muted-foreground mt-1">
          {tw("সাধারণ জিজ্ঞাসা ও উত্তর", "Common questions and answers")}
        </p>
      </div>

      <div className="space-y-3">
        {FAQ.map((item, idx) => (
          <details
            key={idx}
            className="group bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4"
          >
            <summary className="flex items-center justify-between cursor-pointer font-semibold list-none">
              <span>{lang === "en" ? item.qEn : item.qBn}</span>
              <span className="text-primary text-2xl leading-none group-open:rotate-45 transition-transform">
                +
              </span>
            </summary>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {lang === "en" ? item.aEn : item.aBn}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-10 p-6 bg-primary/5 border border-primary/20 rounded-xl text-center">
        <p className="font-semibold mb-1">
          {tw("আরও প্রশ্ন আছে?", "Still have questions?")}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          {tw("আমাদের সাথে সরাসরি যোগাযোগ করুন", "Reach out to us directly")}
        </p>
        <a
          href="tel:+8801710000000"
          className="inline-block px-5 py-2 bg-primary text-white rounded-lg font-semibold hover:opacity-90"
        >
          +৮৮০১৭১০০০০০০০
        </a>
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