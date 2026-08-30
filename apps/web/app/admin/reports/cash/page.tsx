"use client";
import { redirect } from "next/navigation";

export default function ReportsCashRedirect() {
  redirect("/admin/reports/payments");
}
