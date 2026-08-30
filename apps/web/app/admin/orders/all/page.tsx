"use client";

import { OrdersList } from "../_components/orders-list";

export default function AllOrdersPage() {
  return (
    <OrdersList
      titleBn="সব অর্ডার"
      titleEn="All Orders"
      descBn="সকল স্ট্যাটাসের অর্ডার দেখুন ও পরিচালনা করুন"
      descEn="View and manage orders across all statuses"
      defaultView="list"
    />
  );
}
