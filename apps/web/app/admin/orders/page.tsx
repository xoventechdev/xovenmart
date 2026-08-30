"use client";
import { redirect } from "next/navigation";

export default function OrdersIndex() {
  redirect("/admin/orders/pending");
}
