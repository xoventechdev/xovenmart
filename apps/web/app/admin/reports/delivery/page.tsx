"use client";
import { redirect } from "next/navigation";

export default function ReportsDeliveryRedirect() {
  redirect("/admin/reports/orders");
}
