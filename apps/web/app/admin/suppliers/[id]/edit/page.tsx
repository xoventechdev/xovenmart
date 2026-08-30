"use client";

import { use } from "react";
import { SupplierForm } from "../../_components/supplier-form";

export default function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <SupplierForm mode="edit" id={id} />;
}