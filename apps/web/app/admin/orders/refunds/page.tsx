"use client";

import { OrdersList } from "../_components/orders-list";

export default function RefundsPage() {
  return (
    <OrdersList
      statuses={["REFUNDED"]}
      titleBn="ফেরত টাকা"
      titleEn="Refunded Orders"
      descBn="ইতোমধ্যে রিফান্ড সম্পন্ন অর্ডার"
      descEn="Orders for which refund has been processed"
      defaultView="list"
    />
  );
}
