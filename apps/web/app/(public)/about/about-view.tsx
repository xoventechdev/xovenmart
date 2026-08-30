"use client";

import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { useTwin } from "@/lib/i18n";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";

/**
 * Client view for the /about page. All copy lives in bilingual pairs so the
 * language toggle in the site header switches every string live.
 */
export function AboutView() {
  const tw = useTwin();
  const delivery = useDeliveryPublicSafe();
  const mins = delivery.minutes;
  const promiseBn = delivery.labelBn.replace(/\d+/g, String(mins));
  const promiseEn = delivery.labelEn.replace(/\d+/g, String(mins));
  // Only use the zone list when the admin has configured active zones.
  // If none, fall back to a generic phrase so we never advertise a
  // deactivated area.
  const zonesBn =
    delivery.zones.length > 0
      ? delivery.zones.map((z) => z.nameBn).join(", ")
      : "সকল সার্ভিস এলাকা";
  const zonesEn =
    delivery.zones.length > 0
      ? delivery.zones.map((z) => z.nameEn).join(", ")
      : "all service areas";
  // Office address uses the first active zone (if any) plus a fixed bazar
  // name. If no zones are active, show a generic placeholder.
  const officeBn =
    delivery.zones.length > 0
      ? `মুদাফরগঞ্জ বাজার, ${delivery.zones[0].nameBn}`
      : "জোভেন্টমার্ট সার্ভিস এরিয়া";
  const officeEn =
    delivery.zones.length > 0
      ? `Mudafarganj Bazar, ${delivery.zones[0].nameEn}`
      : "XovenMart service area";

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">
        {tw("জোভেন্টমার্ট সম্পর্কে", "About XovenMart")}
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="text-lg text-muted-foreground mb-6">
          {tw(
            `${zonesBn}-এর নিত্যপ্রয়োজনীয় পণ্য সবার আগে দোরগোড়ায় পৌঁছে দেওয়াই আমাদের লক্ষ্য।`,
            `Our mission is to deliver everyday essentials to your doorstep first — across ${zonesEn}.`,
          )}
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">
          {tw("আমাদের মিশন", "Our mission")}
        </h2>
        <p>
          {tw(
            `বাংলাদেশের গ্রামীণ ও মফস্বল এলাকায় আধুনিক ই-কমার্স সেবা পৌঁছে দেওয়া। ${zonesBn} এলাকার মানুষের কাছে তাজা, মানসম্মত পণ্য সাশ্রয়ী মূল্যে সরবরাহ করা।`,
            `Bringing modern e-commerce to rural and semi-urban Bangladesh. Fresh, quality products at fair prices for the people of ${zonesEn}.`,
          )}
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-3">
          {tw("কেন জোভেন্টমার্ট?", "Why XovenMart?")}
        </h2>
        <ul className="space-y-2 list-disc pl-6">
          <li>{tw(`🚚 ${promiseBn} (কাছের এলাকায়)`, `🚚 ${promiseEn} (nearby areas)`)}</li>
          <li>{tw("💰 ক্যাশ অন ডেলিভারি (COD) ও bKash/Nagad", "💰 Cash on Delivery (COD) + bKash/Nagad")}</li>
          <li>{tw("✅ তাজা ও মানসম্মত পণ্যের গ্যারান্টি", "✅ Fresh & quality-guaranteed products")}</li>
          <li>{tw("📞 ২৪/৭ কাস্টমার সাপোর্ট", "📞 24/7 customer support")}</li>
          <li>{tw("🔄 সহজ রিটার্ন ও রিফান্ড পলিসি", "🔄 Easy returns & refunds")}</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-3">
          {tw("আমাদের সাথে যোগাযোগ", "Contact us")}
        </h2>
        <div className="space-y-3 not-prose">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-primary" />
            <span>{tw(officeBn, officeEn)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-primary" />
            <a href="tel:+8801710000000" className="hover:text-primary">
              +৮৮০১৭১০০০০০০০
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-primary" />
            <a href="mailto:hello@xovenmart.com" className="hover:text-primary">
              hello@xovenmart.com
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <span>
              {tw("সকাল ৮টা — রাত ১০টা (প্রতিদিন)", "8 AM — 10 PM (every day)")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}