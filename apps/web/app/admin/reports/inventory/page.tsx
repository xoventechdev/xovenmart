"use client";
import { redirect } from "next/navigation";

export default function ReportsInventoryRedirect() {
  redirect("/admin/reports/products");
}
