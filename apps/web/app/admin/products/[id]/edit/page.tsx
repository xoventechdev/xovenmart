"use client";

import { use } from "react";
import { ProductForm } from "../../_components/product-form";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductForm productId={id} />;
}