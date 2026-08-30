"use client";
import { redirect } from "next/navigation";

export default function BkashIndex() {
  redirect("/admin/payments/transactions");
}
