"use client";
import { redirect } from "next/navigation";

export default function PaymentsIndex() {
  redirect("/admin/payments/cod");
}
