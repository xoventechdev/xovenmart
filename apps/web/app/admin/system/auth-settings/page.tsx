"use client";
import { redirect } from "next/navigation";

export default function AuthSettingsIndex() {
  redirect("/admin/system/auth");
}
