"use client";

import { Shield } from "lucide-react";
import { useTwin } from "@/lib/i18n";

export function PrivacyView() {
  const tw = useTwin();
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">
          {tw("গোপনীয়তা নীতি", "Privacy Policy")}
        </h1>
      </div>

      <div className="prose dark:prose-invert max-w-none text-sm">
        <p className="text-muted-foreground">
          {tw("সর্বশেষ আপডেট: আগস্ট ২০২৬", "Last updated: August 2026")}
        </p>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("১. আমরা কী তথ্য সংগ্রহ করি", "1. What information we collect")}
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            {tw(
              "অর্ডার প্রক্রিয়ার জন্য: নাম, ফোন নম্বর, ডেলিভারি ঠিকানা, অর্ডার ইতিহাস",
              "For order processing: name, phone number, delivery address, order history",
            )}
          </li>
          <li>
            {tw(
              "সার্ভিস উন্নতির জন্য: ব্রাউজার টাইপ, ডিভাইস তথ্য, পেজ ভিজিট",
              "For service improvement: browser type, device info, page visits",
            )}
          </li>
          <li>
            {tw(
              "OTP যাচাইয়ের জন্য: মোবাইল নম্বর (BulkSMSBD-এর মাধ্যমে)",
              "For OTP verification: mobile number (via BulkSMSBD)",
            )}
          </li>
        </ul>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("২. তথ্য ব্যবহার", "2. Use of information")}
        </h2>
        <p>
          {tw(
            "সংগৃহীত তথ্য শুধুমাত্র অর্ডার প্রক্রিয়া, ডেলিভারি, কাস্টমার সাপোর্ট, এবং সার্ভিস উন্নয়নের জন্য ব্যবহৃত হয়। তৃতীয় পক্ষের কাছে বিক্রি বা শেয়ার করা হয় না।",
            "The information collected is used only for order processing, delivery, customer support, and service improvements. It is never sold or shared with third parties.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("৩. তথ্য সংরক্ষণ", "3. Data storage")}
        </h2>
        <p>
          {tw(
            "আপনার তথ্য নিরাপদ সার্ভারে (PostgreSQL + Hetzner EU) সংরক্ষিত থাকে। পেমেন্ট তথ্য আমরা সংরক্ষণ করি না — সরাসরি bKash/Nagad-এর মাধ্যমে প্রক্রিয়া হবে।",
            "Your data is stored on secure servers (PostgreSQL + Hetzner EU). We don't store any payment data — it is processed directly via bKash/Nagad.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">{tw("৪. কুকিজ", "4. Cookies")}</h2>
        <p>
          {tw(
            "আমরা শুধু কার্ট ও সেশন বজায় রাখার জন্য প্রয়োজনীয় কুকিজ ব্যবহার করি। কোনো ট্র্যাকিং বা বিজ্ঞাপনী কুকি নেই।",
            "We only use cookies necessary to keep your cart and session. No tracking or advertising cookies.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">
          {tw("৫. ডেটা মুছে ফেলা", "5. Deleting your data")}
        </h2>
        <p>
          {tw(
            "আপনার অ্যাকাউন্ট ও সম্পর্কিত তথ্য মুছতে চাইলে hello@xovenmart.com ইমেইল করুন। ৭ কর্মদিবসের মধ্যে ডেটা মুছে দেওয়া হবে।",
            "To delete your account and related data, email hello@xovenmart.com. Your data will be removed within 7 business days.",
          )}
        </p>

        <h2 className="font-semibold mt-6 mb-2">{tw("৬. যোগাযোগ", "6. Contact")}</h2>
        <p>
          {tw(
            "গোপনীয়তা সংক্রান্ত যেকোনো প্রশ্নে ইমেইল করুন: hello@xovenmart.com",
            "For any privacy-related questions, email: hello@xovenmart.com",
          )}
        </p>
      </div>
    </div>
  );
}