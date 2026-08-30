"use client";

import { OrdersList } from "../_components/orders-list";

export default function ProcessingOrdersPage() {
  return (
    <OrdersList
      statuses={["ACCEPTED", "PREPARING", "PREPARED"]}
      titleBn="প্রস্তুত হচ্ছে / প্রস্তুত"
      titleEn="Processing / Ready for Pickup"
      descBn="গৃহীত হয়েছে এবং প্রস্তুত হচ্ছে/প্রস্তুত — রাইডারের জন্য অপেক্ষা"
      descEn="Accepted, being prepared, or ready for rider pickup"
      defaultView="list"
    />
  );
}
