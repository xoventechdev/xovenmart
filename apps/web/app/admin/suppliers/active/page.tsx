"use client";

import { SuppliersList } from "../_components/suppliers-list";

export default function ActiveSuppliersPage() {
  return (
    <SuppliersList
      filter="active"
      titleBn="সক্রিয় সরবরাহকারী"
      titleEn="Active Suppliers"
      descBn="শুধুমাত্র সক্রিয় সরবরাহকারী — নতুন অর্ডারে ব্যবহারযোগ্য"
      descEn="Only active suppliers — usable for new orders"
    />
  );
}