"use client";
import { redirect } from "next/navigation";

export default function ApiHealthRedirect() {
  redirect("/admin/system/settings");
}
