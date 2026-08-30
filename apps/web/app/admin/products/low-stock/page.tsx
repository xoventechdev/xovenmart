"use client";
import { ProductsList } from "../_components/products-list";
export default function ProductsLowStockPage() {
  return <ProductsList filter="low-stock" titleBn="কম স্টক" titleEn="Low Stock Products" descBn="স্টক threshold এর নি�ে — রিস্টক করুন" descEn="Below stock threshold — restock soon" showAddButton={false} />;
}
