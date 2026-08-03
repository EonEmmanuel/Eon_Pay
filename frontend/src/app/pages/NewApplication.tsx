import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
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
import { money } from "../lib/format";
import { getCatalogProducts, inventoryProductsKey } from "../lib/inventory";

interface Branch {
  id: string;
  name: string;
}
interface CreatedApplication {
  id: string;
}

export function NewApplication() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [submittedId, setSubmittedId] = useState<string>();
  const [form, setForm] = useState({
    branchId: "",
    catalogProductId: "",
    fullName: "",
    phone: "",
    email: "",
    nationalIdReference: "",
    downPayment: "",
    installmentCount: "6",
    frequency: "monthly",
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiRequest<Branch[]>("/branches"),
  });
  const products = useQuery({
    queryKey: [...inventoryProductsKey, form.branchId],
    enabled: form.branchId !== "",
    queryFn: () => getCatalogProducts(form.branchId),
  });
  const selected = products.data?.find((item) => item.id === form.catalogProductId);
  const mutation = useMutation({
    mutationFn: async () => {
      if (selected === undefined) throw new Error("Select an available product.");
      const application = await apiRequest<CreatedApplication>("/applications", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.branchId,
          catalogProductId: selected.id,
          applicant: {
            fullName: form.fullName,
            phone: form.phone,
            email: form.email || undefined,
            nationalIdReference: form.nationalIdReference || undefined,
          },
          requestedTerms: {
            deviceCashPriceMinorUnits: selected.cashPrice,
            proposedDownPaymentMinorUnits: Number(form.downPayment),
            requestedInstallmentCount: Number(form.installmentCount),
            requestedRepaymentFrequency: form.frequency,
          },
        }),
      });
      await apiRequest(`/applications/${application.id}/submit`, { method: "POST" });
      return application;
    },
    onSuccess: async (application) => {
      setSubmittedId(application.id);
      await client.invalidateQueries({ queryKey: ["applications"] });
    },
  });
  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "branchId" ? { catalogProductId: "" } : {}),
    }));
  }
  if (submittedId !== undefined)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <GlassCard glow="emerald" className="p-8" aria-live="polite">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 text-xl">Application submitted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It is now in the KYC and underwriting queue. No physical IMEI has been
            reserved yet.
          </p>
          <Button
            className="mt-6"
            onClick={() => navigate(`/applications/${submittedId}`)}
          >
            Open application
          </Button>
        </GlassCard>
      </div>
    );
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2"
        onClick={() => navigate("/applications")}
      >
        <ArrowLeft className="size-4" /> Cancel
      </Button>
      <PageHeader
        title="New financing application"
        subtitle="Choose an available catalog product; assign the physical IMEI only when the approved contract is activated"
      />
      {branches.isLoading ? (
        <LoadingState label="Loading branches..." />
      ) : branches.isError ? (
        <ErrorState error={branches.error} retry={() => void branches.refetch()} />
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <GlassCard>
            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <legend className="mb-4 text-base font-semibold">
                Applicant identity
              </legend>
              <Field
                id="name"
                label="Full name"
                value={form.fullName}
                onChange={(value) => update("fullName", value)}
                required
              />
              <Field
                id="phone"
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(value) => update("phone", value)}
                required
              />
              <Field
                id="email"
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => update("email", value)}
              />
              <Field
                id="national-id"
                label="National ID reference"
                value={form.nationalIdReference}
                onChange={(value) => update("nationalIdReference", value)}
              />
            </fieldset>
          </GlassCard>
          <GlassCard>
            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <legend className="mb-4 text-base font-semibold">
                Branch and product
              </legend>
              <div>
                <Label htmlFor="application-branch">Branch</Label>
                <Select
                  required
                  value={form.branchId}
                  onValueChange={(value) => update("branchId", value)}
                >
                  <SelectTrigger id="application-branch">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches.data ?? []).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="application-product">Available product</Label>
                <Select
                  required
                  disabled={!form.branchId || products.isPending}
                  value={form.catalogProductId}
                  onValueChange={(value) => update("catalogProductId", value)}
                >
                  <SelectTrigger id="application-product">
                    <SelectValue
                      placeholder={
                        products.isPending ? "Loading stock..." : "Select product"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(products.data ?? [])
                      .filter((item) => item.active && item.availableUnits > 0)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.brand} {item.model} - {item.storage} - {item.color} (
                          {item.availableUnits})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {selected && (
                <div className="rounded-xl border border-primary/15 bg-primary/[0.05] p-4 sm:col-span-2">
                  <div className="flex items-center gap-4">
                    {selected.imageUrl ? (
                      <img
                        src={selected.imageUrl}
                        alt={selected.brand + " " + selected.model}
                        className="size-20 rounded-xl bg-white/5 object-contain p-1"
                      />
                    ) : (
                      <span className="grid size-20 shrink-0 place-items-center rounded-xl bg-white/5 text-muted-foreground">
                        <Smartphone className="size-8" aria-hidden="true" />
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {selected.brand} {selected.model}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {selected.sku} - {selected.storage} - {selected.color}
                        </div>
                      </div>
                      <div className="font-mono text-lg">
                        {money(selected.cashPrice)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </fieldset>
          </GlassCard>
          <GlassCard>
            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <legend className="mb-4 text-base font-semibold">Requested terms</legend>
              <Field
                id="down-payment"
                label="Proposed down payment (XAF)"
                type="number"
                min="0"
                max={selected?.cashPrice}
                value={form.downPayment}
                onChange={(value) => update("downPayment", value)}
                required
              />
              <Field
                id="installments"
                label="Installment count"
                type="number"
                min="1"
                max="36"
                value={form.installmentCount}
                onChange={(value) => update("installmentCount", value)}
                required
              />
              <div className="sm:col-span-2">
                <Label htmlFor="application-frequency">Repayment frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(value) => update("frequency", value)}
                >
                  <SelectTrigger id="application-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every two weeks</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>
          </GlassCard>
          {mutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={selected === undefined || selected.availableUnits < 1}
              busy={mutation.isPending}
            >
              Submit application
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        required={required}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
