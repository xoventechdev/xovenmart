"use client";
import { redirect } from "next/navigation";

export default function ExpensesIndex() {
  redirect("/admin/expenses/all");
}
