"use client";

import { OrdersList } from "../_components/orders-list";

export default function ReturnsPage() {
  return (
    <OrdersList
      statuses={["RETURNED"]}
      titleBn="ফেরত / রিটার্ন"
      titleEn="Returned Orders"
      descBn="কাস্টমার ফেরত দিয়েছে — রিফান্ড বা এক্সচেঞ্জ প্রসেস করুন"
      descEn="Customer-returned orders — process refunds or exchanges"
      defaultView="list"
    />
  );
}
