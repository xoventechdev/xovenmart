"use client";
import { redirect } from "next/navigation";

export default function ProductsAllRedirect() {
  redirect("/admin/products");
}
