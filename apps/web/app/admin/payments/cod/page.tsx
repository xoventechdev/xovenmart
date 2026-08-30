"use client";
import { redirect } from "next/navigation";

export default function CodIndex() {
  redirect("/admin/payments/verify-cod");
}
