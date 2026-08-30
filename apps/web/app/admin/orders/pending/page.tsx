"use client";

import { OrdersList } from "../_components/orders-list";

export default function PendingOrdersPage() {
  return (
    <OrdersList
      statuses={["PENDING"]}
      titleBn="নতুন / অপেক্ষমান অর্ডার"
      titleEn="New / Pending Orders"
      descBn="এই মুহূর্তে গৃহীত হওয়ার অপেক্ষায় আছে"
      descEn="Awaiting your acceptance"
      defaultView="list"
    />
  );
}
