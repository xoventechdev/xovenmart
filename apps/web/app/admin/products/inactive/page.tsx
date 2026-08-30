"use client";
import { ProductsList } from "../_components/products-list";
export default function ProductsInactivePage() {
  return <ProductsList filter="inactive" titleBn="নিষ্�্রিয় পণ্য" titleEn="Inactive Products" descBn="কাস্টমার দেখবে না" descEn="Hidden from customers" />;
}
