"use client";

import { SuppliersList } from "./_components/suppliers-list";

export default function SuppliersPage() {
  return (
    <SuppliersList
      filter="all"
      titleBn="সব সরবরাহকারী"
      titleEn="All Suppliers"
      descBn="প্রতিটি অর্ডারের জন্য কোন ভেন্ডর থেকে পণ্য সংগ্রহ করা হলো তার রেকর্ড"
      descEn="Track which local vendor supplied products for each order — for returns, warranty, and market research"
    />
  );
}