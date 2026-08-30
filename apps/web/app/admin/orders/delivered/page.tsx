"use client";

import { OrdersList } from "../_components/orders-list";

export default function DeliveredOrdersPage() {
  return (
    <OrdersList
      statuses={["DELIVERED"]}
      titleBn="ডেলিভারি সম্পন্ন"
      titleEn="Delivered Orders"
      descBn="সফলভাবে কাস্টমারের কাছে পৌঁছানো অর্ডার"
      descEn="Successfully delivered orders"
      defaultView="list"
    />
  );
}
