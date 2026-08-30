"use client";
import { redirect } from "next/navigation";

export default function FinancialReportIndex() {
  redirect("/admin/reports/sales");
}
