"use client";

import { OrdersList } from "../_components/orders-list";

export default function DispatchOrdersPage() {
  return (
    <OrdersList
      statuses={["OUT_FOR_DELIVERY"]}
      titleBn="ডেলিভারিতে"
      titleEn="Out for Delivery"
      descBn="রাইডার সহ অর্ডার কাস্টমারের কাছে যাচ্ছে"
      descEn="Orders currently with riders in transit"
      defaultView="list"
    />
  );
}
