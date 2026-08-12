import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Pencil, Plus, Search, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { apiRequest } from "../lib/api";
import { useAuth } from "../lib/auth";
import { money } from "../lib/format";
import {
  type CatalogProduct,
  getCatalogProducts,
  getInventoryUnits,
  inventoryProductsKey,
  inventoryUnitsKey,
  uploadProductImage,
} from "../lib/inventory";

interface Branch {
  id: string;
  name: string;
  active: boolean;
}

type EditableInventoryStatus = "available" | "sold" | "returned" | "damaged";

interface UnitEditForm {
  id: string;
  branchName: string;
  productName: string;
  imei: string;
  serialNumber: string;
  status: EditableInventoryStatus;
  version: number;
}

interface ProductEditForm {
  id: string;
  sku: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  cashPrice: string;
  active: boolean;
  version: number;
}

export function Inventory() {
  const auth = useAuth();
  const client = useQueryClient();
  const canManageCatalog = auth.tenantPermissions.includes("inventory.catalog.manage");
  const canManageStock = auth.tenantPermissions.includes("inventory.stock.manage");
  const [search, setSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitEditForm>();
  const [editingProduct, setEditingProduct] = useState<ProductEditForm>();
  const [productImage, setProductImage] = useState<File>();
  const [imageProduct, setImageProduct] = useState<CatalogProduct>();
  const [replacementImage, setReplacementImage] = useState<File>();
  const [product, setProduct] = useState({
    sku: "",
    brand: "",
    model: "",
    storage: "",
    color: "",
    cashPrice: "",
  });
  const productImagePreview = useObjectUrl(productImage);
  const replacementImagePreview = useObjectUrl(replacementImage);
  const [unit, setUnit] = useState({
    branchId: "",
    catalogProductId: "",
    imei: "",
    serialNumber: "",
  });
  const products = useQuery({
    queryKey: inventoryProductsKey,
    queryFn: () => getCatalogProducts(),
  });
  const units = useQuery({
    queryKey: inventoryUnitsKey,
    queryFn: () => getInventoryUnits(),
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiRequest<Branch[]>("/branches"),
  });
  const activeBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => branch.active),
    [branches.data],
  );
  const soleBranch = activeBranches.length === 1 ? activeBranches[0] : undefined;

  useEffect(() => {
    if (soleBranch !== undefined) {
      setUnit((current) => ({ ...current, branchId: soleBranch.id }));
    }
  }, [soleBranch]);
  const addProduct = useMutation({
    mutationFn: async () => {
      if (productImage) validateProductImageFile(productImage);
      const created = await apiRequest<CatalogProduct>("/inventory/products", {
        method: "POST",
        body: JSON.stringify({
          sku: product.sku,
          brand: product.brand,
          model: product.model,
          storage: product.storage,
          color: product.color,
          cashPriceMinorUnits: Number(product.cashPrice),
        }),
      });
      if (productImage) {
        return uploadProductImage(created.id, productImage);
      }
      return created;
    },
    onSuccess: async () => {
      toast.success("Product added");
      setProductOpen(false);
      setProductImage(undefined);
      setProduct({
        sku: "",
        brand: "",
        model: "",
        storage: "",
        color: "",
        cashPrice: "",
      });
      await client.invalidateQueries({ queryKey: inventoryProductsKey });
    },
    onError: (error) => toast.error(error.message),
  });
  const replaceImage = useMutation({
    mutationFn: async () => {
      if (!imageProduct || !replacementImage) {
        throw new Error("Choose a product image.");
      }
      return uploadProductImage(imageProduct.id, replacementImage);
    },
    onSuccess: async () => {
      toast.success("Product image updated");
      setImageProduct(undefined);
      setReplacementImage(undefined);
      await client.invalidateQueries({ queryKey: inventoryProductsKey });
    },
    onError: (error) => toast.error(error.message),
  });
  const editProduct = useMutation({
    mutationFn: async (input: ProductEditForm) =>
      apiRequest<CatalogProduct>(`/inventory/products/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sku: input.sku,
          brand: input.brand,
          model: input.model,
          storage: input.storage,
          color: input.color,
          cashPriceMinorUnits: Number(input.cashPrice),
          active: input.active,
          version: input.version,
        }),
      }),
    onSuccess: async () => {
      toast.success("Shared product information updated");
      setEditingProduct(undefined);
      await Promise.all([
        client.invalidateQueries({ queryKey: inventoryProductsKey }),
        client.invalidateQueries({ queryKey: inventoryUnitsKey }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const addUnit = useMutation({
    mutationFn: () =>
      apiRequest("/inventory/units", {
        method: "POST",
        body: JSON.stringify({ ...unit, serialNumber: unit.serialNumber || undefined }),
      }),
    onSuccess: async () => {
      toast.success("Stock unit received");
      setUnitOpen(false);
      setUnit({
        branchId: soleBranch?.id ?? "",
        catalogProductId: "",
        imei: "",
        serialNumber: "",
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: inventoryProductsKey }),
        client.invalidateQueries({ queryKey: inventoryUnitsKey }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const editUnit = useMutation({
    mutationFn: async (input: UnitEditForm) =>
      apiRequest(`/inventory/units/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          imei: input.imei,
          serialNumber: input.serialNumber,
          status: input.status,
          version: input.version,
        }),
      }),
    onSuccess: async () => {
      toast.success("Stock unit updated");
      setEditingUnit(undefined);
      await Promise.all([
        client.invalidateQueries({ queryKey: inventoryProductsKey }),
        client.invalidateQueries({ queryKey: inventoryUnitsKey }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (item) =>
        term === "" ||
        `${item.sku} ${item.brand} ${item.model} ${item.storage} ${item.color}`
          .toLowerCase()
          .includes(term),
    );
  }, [products.data, search]);
  const available = (units.data ?? []).filter(
    (item) => item.status === "available",
  ).length;
  const financed = (units.data ?? []).filter(
    (item) => item.status === "financed",
  ).length;

  return (
    <>
      <PageHeader
        title="Retail Stock"
        subtitle="Product catalog and branch-level serialized inventory"
        breadcrumb={["Operations", "Stock"]}
        actions={
          canManageCatalog || canManageStock ? (
            <div className="flex gap-2">
              {canManageCatalog && (
                <Button variant="outline" onClick={() => setProductOpen(true)}>
                  <PackagePlus className="size-4" /> Add product
                </Button>
              )}
              {canManageStock && (
                <Button
                  onClick={() => setUnitOpen(true)}
                  disabled={branches.isPending || activeBranches.length === 0}
                >
                  <Plus className="size-4" /> Receive unit
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Products" value={products.data?.length ?? 0} />
        <Metric label="Serialized units" value={units.data?.length ?? 0} />
        <Metric label="Available" value={available} highlight />
        <Metric label="Financed" value={financed} />
      </div>
      <GlassCard className="mb-4 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search SKU, model, storage, or color"
          />
        </div>
      </GlassCard>
      {products.isPending || units.isPending ? (
        <LoadingState label="Loading retail stock..." />
      ) : products.isError || units.isError ? (
        <ErrorState
          error={products.error ?? units.error}
          retry={() => {
            void products.refetch();
            void units.refetch();
          }}
        />
      ) : visible.length === 0 ? (
        <EmptyState label="No products found. Add a product and receive its physical units." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((item) => {
            const stock = (units.data ?? []).filter(
              (row) => row.catalogProductId === item.id,
            );
            return (
              <GlassCard key={item.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.brand + " " + item.model}
                        className="size-16 shrink-0 rounded-xl bg-muted/60 object-contain p-1"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Smartphone className="size-7" aria-hidden="true" />
                      </span>
                    )}
                    <div>
                      <h2 className="font-medium">
                        {item.brand} {item.model}
                      </h2>
                      <p className="font-mono text-xs text-muted-foreground">
                        {item.sku} - {item.storage} - {item.color}
                      </p>
                    </div>
                  </div>
                  <StatusBadge tone={item.availableUnits > 0 ? "success" : "warning"}>
                    {item.availableUnits} available
                  </StatusBadge>
                </div>
                <div className="mt-4 flex justify-between border-t border-border pt-4">
                  <span className="font-mono text-lg">{money(item.cashPrice)}</span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground">
                      {stock.length} units
                    </span>
                    {canManageCatalog && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditingProduct({
                              id: item.id,
                              sku: item.sku,
                              brand: item.brand,
                              model: item.model,
                              storage: item.storage,
                              color: item.color,
                              cashPrice: String(item.cashPrice),
                              active: item.active,
                              version: item.version,
                            })
                          }
                        >
                          <Pencil className="size-3.5" /> Edit product
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setImageProduct(item);
                            setReplacementImage(undefined);
                          }}
                        >
                          {item.imageUrl ? "Change image" : "Add image"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {stock.length > 0 && (
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {stock.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0">
                          <span className="font-mono">{row.imei}</span>
                          <span className="ml-2 text-muted-foreground">
                            {row.branch.name}
                          </span>
                          {row.serialNumber && (
                            <span className="block truncate text-muted-foreground">
                              Serial: {row.serialNumber}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <StatusBadge
                            tone={
                              row.status === "available"
                                ? "success"
                                : row.status === "damaged"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {row.status}
                          </StatusBadge>
                          {canManageStock &&
                            !["reserved", "financed"].includes(row.status) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Edit ${item.brand} ${item.model} with IMEI ${row.imei}`}
                                onClick={() =>
                                  setEditingUnit({
                                    id: row.id,
                                    branchName: row.branch.name,
                                    productName: `${item.brand} ${item.model} - ${item.storage} - ${item.color}`,
                                    imei: row.imei,
                                    serialNumber: row.serialNumber ?? "",
                                    status: row.status as EditableInventoryStatus,
                                    version: row.version,
                                  })
                                }
                              >
                                <Pencil className="size-3.5" /> Edit
                              </Button>
                            )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
      <Dialog
        open={productOpen}
        onOpenChange={(open) => {
          setProductOpen(open);
          if (!open) setProductImage(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add catalog product</DialogTitle>
            <DialogDescription>
              Define a sellable phone variant. IMEIs are received separately.
            </DialogDescription>
          </DialogHeader>
          <form
            id="product-form"
            className="grid grid-cols-2 gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              addProduct.mutate();
            }}
          >
            {(["sku", "brand", "model", "storage", "color", "cashPrice"] as const).map(
              (key) => (
                <div key={key} className={key === "cashPrice" ? "col-span-2" : ""}>
                  <Label htmlFor={`product-${key}`}>
                    {key === "cashPrice"
                      ? "Cash price (XAF)"
                      : key[0].toUpperCase() + key.slice(1)}
                  </Label>
                  <Input
                    id={`product-${key}`}
                    type={key === "cashPrice" ? "number" : "text"}
                    min={key === "cashPrice" ? 1 : undefined}
                    required
                    value={product[key]}
                    onChange={(event) =>
                      setProduct((old) => ({ ...old, [key]: event.target.value }))
                    }
                  />
                </div>
              ),
            )}
            <div className="col-span-2">
              <Label htmlFor="product-image">Product image (optional)</Label>
              <Input
                id="product-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setProductImage(event.target.files?.[0])}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Maximum 5 MB.
              </p>
              {productImagePreview && (
                <img
                  src={productImagePreview}
                  alt="New product preview"
                  className="mt-3 h-32 w-full rounded-xl bg-muted/60 object-contain p-2"
                />
              )}
            </div>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setProductOpen(false);
                setProductImage(undefined);
              }}
            >
              Cancel
            </Button>
            <Button form="product-form" type="submit" busy={addProduct.isPending}>
              Save product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editingProduct !== undefined}
        onOpenChange={(open) => {
          if (!open && !editProduct.isPending) setEditingProduct(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit shared product information</DialogTitle>
            <DialogDescription>
              These catalog details are shared by every physical unit of this product.
              Existing application and contract snapshots remain unchanged.
            </DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <form
              id="edit-product-form"
              className="grid grid-cols-2 gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                editProduct.mutate(editingProduct);
              }}
            >
              {(
                ["sku", "brand", "model", "storage", "color", "cashPrice"] as const
              ).map((key) => (
                <div key={key} className={key === "cashPrice" ? "col-span-2" : ""}>
                  <Label htmlFor={`edit-product-${key}`}>
                    {key === "cashPrice"
                      ? "Cash price (XAF)"
                      : key[0].toUpperCase() + key.slice(1)}
                  </Label>
                  <Input
                    id={`edit-product-${key}`}
                    type={key === "cashPrice" ? "number" : "text"}
                    min={key === "cashPrice" ? 1 : undefined}
                    required
                    value={editingProduct[key]}
                    onChange={(event) =>
                      setEditingProduct((current) =>
                        current ? { ...current, [key]: event.target.value } : current,
                      )
                    }
                  />
                </div>
              ))}
              <div className="col-span-2">
                <Choice
                  label="Catalog availability"
                  value={editingProduct.active ? "active" : "inactive"}
                  placeholder="Select availability"
                  onChange={(value) =>
                    setEditingProduct((current) =>
                      current ? { ...current, active: value === "active" } : current,
                    )
                  }
                  options={[
                    { value: "active", label: "Active - available for new sales" },
                    { value: "inactive", label: "Inactive - hide from new sales" },
                  ]}
                />
              </div>
            </form>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={editProduct.isPending}
              onClick={() => setEditingProduct(undefined)}
            >
              Cancel
            </Button>
            <Button form="edit-product-form" type="submit" busy={editProduct.isPending}>
              Save shared information
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={imageProduct !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setImageProduct(undefined);
            setReplacementImage(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {imageProduct?.imageUrl ? "Change product image" : "Add product image"}
            </DialogTitle>
            <DialogDescription>
              {imageProduct
                ? `${imageProduct.brand} ${imageProduct.model} - public catalog image`
                : "Choose a catalog product image."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="replacement-product-image">Image</Label>
            <Input
              id="replacement-product-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => setReplacementImage(event.target.files?.[0])}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG, PNG, or WebP. Maximum 5 MB.
            </p>
            {(replacementImagePreview || imageProduct?.imageUrl) && (
              <img
                src={replacementImagePreview ?? imageProduct?.imageUrl ?? ""}
                alt={
                  replacementImagePreview
                    ? "Selected product image preview"
                    : imageProduct?.brand + " " + imageProduct?.model
                }
                className="mt-3 h-52 w-full rounded-xl bg-muted/60 object-contain p-2"
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImageProduct(undefined);
                setReplacementImage(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!replacementImage}
              busy={replaceImage.isPending}
              onClick={() => replaceImage.mutate()}
            >
              Save image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive stock unit</DialogTitle>
            <DialogDescription>
              Record a physical phone before it can be financed.
            </DialogDescription>
          </DialogHeader>
          <form
            id="unit-form"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              addUnit.mutate();
            }}
          >
            {soleBranch ? (
              <div>
                <Label>Branch</Label>
                <div className="mt-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                  {soleBranch.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    Your assigned branch
                  </span>
                </div>
              </div>
            ) : (
              <Choice
                label="Branch"
                value={unit.branchId}
                placeholder="Select branch"
                onChange={(value) => setUnit((old) => ({ ...old, branchId: value }))}
                options={activeBranches.map((row) => ({
                  value: row.id,
                  label: row.name,
                }))}
              />
            )}
            <Choice
              label="Product"
              value={unit.catalogProductId}
              placeholder="Select product"
              onChange={(value) =>
                setUnit((old) => ({ ...old, catalogProductId: value }))
              }
              options={(products.data ?? [])
                .filter((row) => row.active)
                .map((row) => ({
                  value: row.id,
                  label: `${row.brand} ${row.model} - ${row.storage} - ${row.color}`,
                }))}
            />
            <div>
              <Label htmlFor="unit-imei">IMEI</Label>
              <Input
                id="unit-imei"
                inputMode="numeric"
                pattern="[0-9]{15}"
                maxLength={15}
                required
                value={unit.imei}
                onChange={(event) =>
                  setUnit((old) => ({
                    ...old,
                    imei: event.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="unit-serial">Serial number (optional)</Label>
              <Input
                id="unit-serial"
                value={unit.serialNumber}
                onChange={(event) =>
                  setUnit((old) => ({ ...old, serialNumber: event.target.value }))
                }
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitOpen(false)}>
              Cancel
            </Button>
            <Button
              form="unit-form"
              type="submit"
              disabled={activeBranches.length === 0}
              busy={addUnit.isPending}
            >
              Receive unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editingUnit !== undefined}
        onOpenChange={(open) => {
          if (!open && !editUnit.isPending) setEditingUnit(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit stock unit</DialogTitle>
            <DialogDescription>
              Correct serialized stock details. Reserved and financed units cannot be
              edited manually.
            </DialogDescription>
          </DialogHeader>
          {editingUnit && (
            <form
              id="edit-unit-form"
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                editUnit.mutate(editingUnit);
              }}
            >
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p>{editingUnit.productName}</p>
                <p className="text-xs text-muted-foreground">
                  Branch: {editingUnit.branchName}
                </p>
              </div>
              <div>
                <Label htmlFor="edit-unit-imei">IMEI</Label>
                <Input
                  id="edit-unit-imei"
                  inputMode="numeric"
                  pattern="[0-9]{15}"
                  maxLength={15}
                  required
                  value={editingUnit.imei}
                  onChange={(event) =>
                    setEditingUnit((current) =>
                      current
                        ? {
                            ...current,
                            imei: event.target.value.replace(/\D/g, ""),
                          }
                        : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-unit-serial">Serial number (optional)</Label>
                <Input
                  id="edit-unit-serial"
                  maxLength={120}
                  value={editingUnit.serialNumber}
                  onChange={(event) =>
                    setEditingUnit((current) =>
                      current
                        ? { ...current, serialNumber: event.target.value }
                        : current,
                    )
                  }
                />
              </div>
              <Choice
                label="Status"
                value={editingUnit.status}
                placeholder="Select status"
                onChange={(value) =>
                  setEditingUnit((current) =>
                    current
                      ? { ...current, status: value as EditableInventoryStatus }
                      : current,
                  )
                }
                options={[
                  { value: "available", label: "Available" },
                  { value: "sold", label: "Sold" },
                  { value: "returned", label: "Returned" },
                  { value: "damaged", label: "Damaged" },
                ]}
              />
            </form>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={editUnit.isPending}
              onClick={() => setEditingUnit(undefined)}
            >
              Cancel
            </Button>
            <Button form="edit-unit-form" type="submit" busy={editUnit.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function validateProductImageFile(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Product images must not exceed 5 MB.");
  }
}
function useObjectUrl(file?: File) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!file) {
      setUrl(undefined);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}
function Choice({
  label,
  value,
  placeholder,
  onChange,
  options,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = `inventory-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select required value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <GlassCard className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-2xl font-semibold ${highlight ? "text-primary" : ""}`}
      >
        {value}
      </div>
    </GlassCard>
  );
}
