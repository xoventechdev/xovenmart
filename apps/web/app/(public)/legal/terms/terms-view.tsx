"use client";

import { FileText } from "lucide-react";
import { useTwin } from "@/lib/i18n";

export function TermsView() {
  const tw = useTwin();
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">{tw("শর্তাবলী", "Terms of Service")}</h1>
      </div>

      <div className="prose dark:prose-invert max-w-none text-sm">
        <p className="text-muted-foreground">
          {tw("সর্বশেষ আপডেট: আগস্ট ২০২৬", "Last updated: August 2026")}
        </p>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("১. সেবার স্বরূপ", "1. Nature of service")}
        </h2>
        <p>
          {tw(
            "জোভেন্টমার্ট একটি এক-বিক্রেতা (single-vendor) ই-কমার্স প্ল্যাটফর্ম যা মুদাফরগঞ্জ, লাকসাম ও কুমিল্লা এলাকায় নিত্যপ্রয়োজনীয় পণ্য ডেলিভারি সেবা প্রদান করে।",
            "XovenMart is a single-vendor e-commerce platform that delivers everyday essentials across Mudafarganj, Laksam, and Cumilla.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("২. অর্ডার ও পেমেন্ট", "2. Orders & payment")}
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            {tw(
              "বর্তমানে শুধু ক্যাশ অন ডেলিভারি (COD) গ্রহণযোগ্য।",
              "Currently only Cash on Delivery (COD) is accepted.",
            )}
          </li>
          <li>
            {tw(
              "অর্ডার কনফার্ম হওয়ার আগে যেকোনো সময় বাতিল করা যাবে।",
              "You may cancel any time before the order is confirmed.",
            )}
          </li>
          <li>
            {tw(
              "পণ্যের দাম ও প্রাপ্যতা পরিবর্তন সাপেক্ষে।",
              "Prices and availability are subject to change.",
            )}
          </li>
        </ul>

        <h2 className="font-semibold mt-6 mb-2">{tw("৩. ডেলিভারি", "3. Delivery")}</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>{tw("মুদাফরগঞ্জ ও লাকসাম: ৩০-৬০ মিনিট।", "Mudafarganj & Laksam: 30–60 minutes.")}</li>
          <li>{tw("কুমিল্লা সদর ও আশেপাশে: ১-২ ঘণ্টা।", "Cumilla Sadar & surroundings: 1–2 hours.")}</li>
          <li>
            {tw(
              "ডেলিভারি চার্জ এলাকা ও অর্ডার মূল্য অনুযায়ী।",
              "Delivery charge depends on area and order value.",
            )}
          </li>
        </ul>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("৪. রিটার্ন ও রিফান্ড", "4. Returns & refunds")}
        </h2>
        <p>
          {tw(
            "পণ্য গ্রহণের সময় চেক করুন। সমস্যা থাকলে ২৪ ঘণ্টার মধ্যে জানান। রিফান্ড ২-৩ কর্মদিবসের মধ্যে প্রক্রিয়া করা হয়।",
            "Inspect your order on receipt. If there's a problem, let us know within 24 hours. Refunds are processed within 2–3 business days.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">{tw("৫. দায়", "5. Liability")}</h2>
        <p>
          {tw(
            "ডেলিভারি সময় আনুমানিক। যানজট, প্রাকৃতিক দুর্যোগ বা অন্যান্য অপ্রত্যাশিত পরিস্থিতিতে বিলম্ব হতে পারে।",
            "Delivery times are approximate. Delays may occur due to traffic, weather, or other unforeseen circumstances.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">{tw("৬. যোগাযোগ", "6. Contact")}</h2>
        <p>
          {tw(
            "যেকোনো প্রশ্নে যোগাযোগ করুন: hello@xovenmart.com অথবা +৮৮০১৭১০০০০০০০",
            "For any questions, contact: hello@xovenmart.com or +8801710000000",
          )}
        </p>
      </div>
    </div>
  );
}