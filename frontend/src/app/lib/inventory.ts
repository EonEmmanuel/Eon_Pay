import { apiRequest } from "./api";

export interface CatalogProduct {
  id: string;
  sku: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  cashPrice: number;
  imagePath: string | null;
  imageUrl: string | null;
  active: boolean;
  version: number;
  availableUnits: number;
}
export interface InventoryUnit {
  id: string;
  branchId: string;
  catalogProductId: string;
  contractId: string | null;
  imei: string;
  serialNumber: string | null;
  status: "available" | "reserved" | "financed" | "sold" | "returned" | "damaged";
  version: number;
  product: CatalogProduct;
  branch: { id: string; name: string };
}
export const inventoryProductsKey = ["inventory", "products"] as const;
export const inventoryUnitsKey = ["inventory", "units"] as const;
export function getCatalogProducts(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiRequest<CatalogProduct[]>(`/inventory/products${query}`);
}
export function getInventoryUnits(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiRequest<InventoryUnit[]>(`/inventory/units${query}`);
}

export async function uploadProductImage(productId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Product images must not exceed 5 MB.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const request = {
    mimeType: file.type,
    sizeBytes: file.size,
    sha256,
  };
  const prepared = await apiRequest<{
    objectKey: string;
    upload: { url: string; headers: Record<string, string> };
  }>(`/inventory/products/${productId}/image-upload`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  const uploaded = await fetch(prepared.upload.url, {
    method: "PUT",
    headers: prepared.upload.headers,
    body: file,
  });
  if (!uploaded.ok) {
    throw new Error("Supabase Storage rejected the product image upload.");
  }
  return apiRequest<CatalogProduct>(`/inventory/products/${productId}/image-confirm`, {
    method: "POST",
    body: JSON.stringify({ ...request, objectKey: prepared.objectKey }),
  });
}
