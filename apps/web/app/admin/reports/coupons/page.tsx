"use client";
import { redirect } from "next/navigation";

export default function ReportsCouponsRedirect() {
  redirect("/admin/coupons/redemptions");
}
