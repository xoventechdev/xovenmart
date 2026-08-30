"use client";

import { OrdersList } from "../_components/orders-list";

export default function CancelledOrdersPage() {
  return (
    <OrdersList
      statuses={["CANCELLED"]}
      titleBn="বাতিল অর্ডার"
      titleEn="Cancelled Orders"
      descBn="কাস্টমার বা অ্যাডমিন কর্তৃক বাতিল অর্ডার"
      descEn="Orders cancelled by customer or admin"
      defaultView="list"
    />
  );
}
