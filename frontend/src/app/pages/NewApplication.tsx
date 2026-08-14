import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  Info,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
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
import { cn } from "../components/ui/utils";
import { apiRequest } from "../lib/api";
import { money } from "../lib/format";
import { getCatalogProducts, inventoryProductsKey, type CatalogProduct } from "../lib/inventory";

interface Branch {
  id: string;
  name: string;
}
interface CreatedApplication {
  id: string;
}

const STEPS = [
  { step: 1, title: "Applicant Identity", subtitle: "Branch & customer info" },
  { step: 2, title: "Device Selection", subtitle: "Choose catalog product" },
  { step: 3, title: "Financing Terms", subtitle: "Schedule & submission" },
];

export function NewApplication() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [submittedId, setSubmittedId] = useState<string>();
  const [productSearch, setProductSearch] = useState("");

  const [form, setForm] = useState({
    branchId: "",
    catalogProductId: "",
    fullName: "",
    phone: "",
    email: "",
    nationalIdReference: "",
    downPayment: "",
    installmentCount: "6",
    frequency: "monthly" as "weekly" | "biweekly" | "monthly",
  });

  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiRequest<Branch[]>("/branches"),
  });

  // Auto-select first branch if available and none selected
  const availableBranches = branches.data ?? [];
  const selectedBranchId = form.branchId || (availableBranches.length > 0 ? availableBranches[0].id : "");

  const products = useQuery({
    queryKey: [...inventoryProductsKey, selectedBranchId],
    enabled: selectedBranchId !== "",
    queryFn: () => getCatalogProducts(selectedBranchId),
  });

  const availableProducts = useMemo(() => {
    return (products.data ?? []).filter((item) => item.active && item.availableUnits > 0);
  }, [products.data]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return availableProducts;
    const q = productSearch.toLowerCase();
    return availableProducts.filter(
      (p) =>
        p.brand.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.storage.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q),
    );
  }, [availableProducts, productSearch]);

  const selected = products.data?.find((item) => item.id === form.catalogProductId);

  // Financial calculations
  const devicePrice = selected?.cashPrice ?? 0;
  const downPaymentNum = Number(form.downPayment) || 0;
  const amountFinanced = Math.max(0, devicePrice - downPaymentNum);
  const installmentCountNum = Math.max(1, Number(form.installmentCount) || 6);
  const installmentAmount = Math.round(amountFinanced / installmentCountNum);
  const downPaymentPercent = devicePrice > 0 ? Math.round((downPaymentNum / devicePrice) * 100) : 0;

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "branchId" ? { catalogProductId: "" } : {}),
    }));
  }

  function handleSelectProduct(product: CatalogProduct) {
    setForm((current) => {
      // Set default 20% down payment if currently empty
      const defaultDown = current.downPayment === "" ? String(Math.round(product.cashPrice * 0.2)) : current.downPayment;
      return {
        ...current,
        catalogProductId: product.id,
        downPayment: defaultDown,
      };
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (selected === undefined) throw new Error("Select an available product.");
      const application = await apiRequest<CreatedApplication>("/applications", {
        method: "POST",
        body: JSON.stringify({
          branchId: selectedBranchId,
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
      toast.success("Application successfully submitted!");
    },
  });

  function validateStep1(): boolean {
    if (!form.fullName.trim()) {
      toast.error("Please enter applicant full name.");
      return false;
    }
    if (!form.phone.trim()) {
      toast.error("Please enter applicant phone number.");
      return false;
    }
    return true;
  }

  function validateStep2(): boolean {
    if (!form.catalogProductId || !selected) {
      toast.error("Please select a device from the catalog.");
      return false;
    }
    return true;
  }

  function handleNext() {
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2);
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        setCurrentStep(3);
      }
    } else if (currentStep === 3) {
      mutation.mutate();
    }
  }

  function handlePrev() {
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
  }

  // Submitted Success View
  if (submittedId !== undefined) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center animate-in fade-in duration-300">
        <GlassCard glow="emerald" className="p-8 shadow-xl">
          <div className="relative mx-auto my-2 flex size-20 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
            <CheckCircle2 className="size-10 text-[#00DF81]" />
          </div>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-[#00DF81]">
            Application ID: {submittedId}
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            Application Submitted
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            The customer financing application has been placed in the underwriting queue.
            Device IMEI and Knox enrollment will be assigned upon contract activation.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setSubmittedId(undefined);
                setCurrentStep(1);
                setForm({
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
              }}
              className="rounded-xl text-xs"
            >
              Create another application
            </Button>
            <Button
              onClick={() => navigate(`/applications/${submittedId}`)}
              className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs"
            >
              Open application
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="pb-16 pt-2">
      {/* Top Header Row */}
      <div className="mb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="group -ml-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/applications")}
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Cancel
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          Step {currentStep} of 3
        </span>
      </div>

      <PageHeader
        title="New financing application"
        subtitle="Create a customer installment plan across 3 easy steps"
      />

      {/* 3-Step Modern Progress Stepper Bar */}
      <div className="my-6 rounded-2xl border border-border bg-card p-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          {STEPS.map((s, index) => {
            const isCompleted = currentStep > s.step;
            const isActive = currentStep === s.step;
            const isUpcoming = currentStep < s.step;

            return (
              <div key={s.step} className="flex flex-1 items-center">
                {/* Stepper Node */}
                <div
                  onClick={() => {
                    if (isCompleted) setCurrentStep(s.step as 1 | 2 | 3);
                  }}
                  className={cn(
                    "flex items-center gap-3 transition-all",
                    isCompleted && "cursor-pointer",
                  )}
                >
                  <div
                    className={cn(
                      "grid size-8 place-items-center rounded-xl font-mono text-xs font-bold transition-all duration-300",
                      isActive &&
                        "bg-[#00DF81] text-black shadow-md shadow-emerald-500/30 ring-2 ring-emerald-500/30 scale-105",
                      isCompleted && "bg-emerald-500/20 text-emerald-600 dark:text-[#00DF81] border border-emerald-500/40",
                      isUpcoming && "bg-muted text-muted-foreground border border-border/80",
                    )}
                  >
                    {isCompleted ? <Check className="size-4 stroke-[3]" /> : s.step}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div
                      className={cn(
                        "text-xs font-semibold leading-tight transition-colors",
                        isActive && "text-[#00DF81]",
                        isCompleted && "text-foreground",
                        isUpcoming && "text-muted-foreground",
                      )}
                    >
                      {s.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{s.subtitle}</div>
                  </div>
                </div>

                {/* Connecting Track Line */}
                {index < STEPS.length - 1 && (
                  <div className="mx-3 h-[2px] flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        currentStep > s.step ? "w-full bg-[#00DF81]" : "w-0",
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {branches.isLoading ? (
        <LoadingState label="Loading branches..." />
      ) : branches.isError ? (
        <ErrorState error={branches.error} retry={() => void branches.refetch()} />
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            handleNext();
          }}
          className="space-y-6"
        >
          {/* ========================================================================= */}
          {/* STEP 1: Applicant Identity & Branch                                       */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left Form: Branch & Personal Details */}
                <div className="space-y-5 lg:col-span-8">
                  {/* Branch Selection Card */}
                  <GlassCard className="p-5">
                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                      <Store className="size-4 text-emerald-500" />
                      <span>1. Store & Location</span>
                    </div>
                    <div>
                      <Label htmlFor="application-branch" className="text-xs font-medium">Branch Location</Label>
                      <Select
                        required
                        value={selectedBranchId}
                        onValueChange={(value) => update("branchId", value)}
                      >
                        <SelectTrigger id="application-branch" className="mt-1.5 h-10 rounded-xl">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBranches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Devices in inventory will be loaded for this selected store branch.
                      </p>
                    </div>
                  </GlassCard>

                  {/* Customer Identity Fields */}
                  <GlassCard className="p-5">
                    <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
                      <User className="size-4 text-emerald-500" />
                      <span>2. Applicant Details</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        id="name"
                        label="Full name"
                        placeholder="e.g. Jean Paul Abena"
                        value={form.fullName}
                        onChange={(value) => update("fullName", value)}
                        required
                      />
                      <Field
                        id="phone"
                        label="Phone number"
                        type="tel"
                        placeholder="e.g. +237 6 12 34 56 78"
                        value={form.phone}
                        onChange={(value) => update("phone", value)}
                        required
                      />
                      <Field
                        id="email"
                        label="Email address"
                        type="email"
                        placeholder="e.g. customer@email.com"
                        value={form.email}
                        onChange={(value) => update("email", value)}
                      />
                      <Field
                        id="national-id"
                        label="National ID reference"
                        placeholder="e.g. 1102001234567A"
                        value={form.nationalIdReference}
                        onChange={(value) => update("nationalIdReference", value)}
                      />
                    </div>
                  </GlassCard>
                </div>

                {/* Right Column: Information & Trust Guide */}
                <div className="space-y-4 lg:col-span-4">
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Zap className="size-4 text-emerald-500" />
                      <span>Instant KYC Check</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                      Applicants with a valid National ID and phone number qualify for automatic real-time underwriting scoring.
                    </p>

                    <div className="mt-4 space-y-2.5 border-t border-border/80 pt-3 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Check className="size-3.5 text-emerald-500 shrink-0" />
                        <span>Instant eligibility feedback</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Check className="size-3.5 text-emerald-500 shrink-0" />
                        <span>Encrypted identity verification</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Check className="size-3.5 text-emerald-500 shrink-0" />
                        <span>Zero physical paperwork required</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-[#00DF81] mb-1">
                      <ShieldCheck className="size-4" /> Secure & Compliant
                    </div>
                    Customer information is encrypted under ISO/IEC 27001 data protection protocols.
                  </div>
                </div>
              </div>

              {/* Step 1 Action Bar */}
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={handleNext}
                  className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs px-6 h-10 gap-1.5 w-full sm:w-auto"
                >
                  Continue to Device Selection <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: Device & Product Selection                                        */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <GlassCard className="p-6 shadow-xs">
                {/* Search & Stock Info Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Choose an Available Device
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Showing stock for branch: <strong>{availableBranches.find((b) => b.id === selectedBranchId)?.name || "Current Store"}</strong>
                    </p>
                  </div>

                  <div className="relative w-full max-w-xs">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by brand, model or SKU..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="h-9 rounded-xl pl-9 text-xs"
                    />
                  </div>
                </div>

                {/* Product Catalog Grid */}
                {products.isLoading ? (
                  <LoadingState label="Loading branch inventory..." />
                ) : filteredProducts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No active inventory units found in this branch matching your search.
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredProducts.map((product) => {
                      const isSelected = form.catalogProductId === product.id;
                      return (
                        <div
                          key={product.id}
                          onClick={() => handleSelectProduct(product)}
                          className={cn(
                            "group relative flex flex-col justify-between rounded-2xl border p-4 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 shadow-2xs",
                            isSelected
                              ? "border-[#00DF81] bg-emerald-500/[0.05] ring-2 ring-[#00DF81]/30"
                              : "border-border bg-card hover:border-primary/40",
                          )}
                        >
                          {isSelected && (
                            <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[#00DF81] text-black shadow-xs">
                              <Check className="size-3 stroke-[3]" />
                            </span>
                          )}

                          {/* Image preview */}
                          <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-2">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={`${product.brand} ${product.model}`}
                                className="max-h-full object-contain transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <Smartphone className="size-10 text-muted-foreground" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="mt-3">
                            <div className="font-bold text-sm text-foreground">
                              {product.brand} {product.model}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {product.storage} · {product.color}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/80 truncate">
                              SKU: {product.sku}
                            </div>
                          </div>

                          {/* Price & Stock */}
                          <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2.5">
                            <span className="font-mono font-bold text-sm text-foreground">
                              {money(product.cashPrice)}
                            </span>
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                              {product.availableUnits} in stock
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>

              {/* Step 2 Action Bar */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="rounded-xl gap-1.5 text-xs h-10 px-4 w-full sm:w-auto"
                >
                  <ArrowLeft className="size-4" /> Back to Identity
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!form.catalogProductId}
                  className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs px-6 h-10 gap-1.5 disabled:opacity-50 w-full sm:w-auto"
                >
                  Continue to Financing Terms <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: Financing Terms & Submission                                      */}
          {/* ========================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left Column: Requested Terms Config */}
                <div className="space-y-5 lg:col-span-7">
                  {/* Selected Device Preview Banner */}
                  {selected && (
                    <GlassCard className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Selected Device
                      </div>
                      <div className="flex items-center gap-3.5">
                        <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-card p-1 border border-border">
                          {selected.imageUrl ? (
                            <img
                              src={selected.imageUrl}
                              alt={selected.model}
                              className="size-full object-contain"
                            />
                          ) : (
                            <Smartphone className="size-full text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm text-foreground">
                            {selected.brand} {selected.model}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {selected.storage} · {selected.color} · SKU: {selected.sku}
                          </div>
                        </div>
                        <div className="text-right font-mono text-sm font-bold text-foreground">
                          {money(devicePrice)}
                        </div>
                      </div>
                    </GlassCard>
                  )}

                  {/* Financing Terms Card */}
                  <GlassCard className="p-5 space-y-4">
                    <div className="text-sm font-semibold text-foreground">
                      Configure Installment Plan
                    </div>

                    {/* Proposed Down Payment */}
                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="down-payment" className="text-xs font-medium">
                          Proposed Down Payment (XAF)
                        </Label>
                        {devicePrice > 0 && (
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-[#00DF81]">
                            {downPaymentPercent}% of price
                          </span>
                        )}
                      </div>
                      <Input
                        id="down-payment"
                        type="number"
                        min="0"
                        max={devicePrice}
                        placeholder="e.g. 48000"
                        value={form.downPayment}
                        onChange={(e) => update("downPayment", e.target.value)}
                        className="mt-1.5 h-10 rounded-xl font-mono text-sm"
                        required
                      />

                      {/* Quick percentage pills */}
                      {devicePrice > 0 && (
                        <div className="mt-2 flex gap-2">
                          {[10, 20, 30, 50].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => update("downPayment", String(Math.round(devicePrice * (pct / 100))))}
                              className={cn(
                                "flex-1 rounded-lg py-1 text-[11px] font-mono border transition-colors",
                                downPaymentPercent === pct
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#00DF81] font-bold"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Installment Count */}
                    <div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="installments" className="text-xs font-medium">
                          Installment Count
                        </Label>
                        <span className="text-xs font-semibold text-foreground">{form.installmentCount} installments</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => update("installmentCount", String(Math.max(1, Number(form.installmentCount) - 1)))}
                          className="grid size-9 place-items-center rounded-xl border border-border bg-muted/50 hover:bg-accent text-foreground transition-colors"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <Input
                          id="installments"
                          type="number"
                          min="1"
                          max="36"
                          value={form.installmentCount}
                          onChange={(e) => update("installmentCount", e.target.value)}
                          className="h-9 rounded-xl font-mono text-center font-bold text-sm"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => update("installmentCount", String(Math.min(36, Number(form.installmentCount) + 1)))}
                          className="grid size-9 place-items-center rounded-xl border border-border bg-muted/50 hover:bg-accent text-foreground transition-colors"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>

                      {/* Quick Month Preset Buttons */}
                      <div className="mt-2 flex gap-2">
                        {["3", "6", "9", "12"].map((cnt) => (
                          <button
                            key={cnt}
                            type="button"
                            onClick={() => update("installmentCount", cnt)}
                            className={cn(
                              "flex-1 rounded-lg py-1 text-[11px] font-mono border transition-colors",
                              form.installmentCount === cnt
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-[#00DF81] font-semibold"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {cnt} mos
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Repayment Frequency */}
                    <div>
                      <Label htmlFor="application-frequency" className="text-xs font-medium">Repayment Frequency</Label>
                      <Select
                        value={form.frequency}
                        onValueChange={(value) => update("frequency", value)}
                      >
                        <SelectTrigger id="application-frequency" className="mt-1.5 h-10 rounded-xl text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Every two weeks</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </GlassCard>
                </div>

                {/* Right Column: Live Financial Preview Box & Applicant Recap */}
                <div className="space-y-4 lg:col-span-5">
                  {/* Financial Breakdown Preview */}
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
                    <div className="text-sm font-semibold text-foreground border-b border-border pb-2 flex items-center justify-between">
                      <span>Payment Preview</span>
                      <Wallet className="size-4 text-emerald-500" />
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Device Cash Price</span>
                        <span className="font-mono font-medium text-foreground">{money(devicePrice)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-[#00DF81]">
                        <span>Down Payment</span>
                        <span className="font-mono font-medium">-{money(downPaymentNum)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount Financed</span>
                        <span className="font-mono font-medium text-foreground">{money(amountFinanced)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-2 font-semibold">
                        <span className="text-foreground capitalize">{form.frequency} Installment</span>
                        <span className="font-mono text-base text-[#00DF81] font-bold">
                          {money(installmentAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total Repayment</span>
                        <span className="font-mono text-foreground font-semibold">{money(devicePrice)}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/40 p-2.5 text-xs text-muted-foreground border border-border">
                      <Calendar className="size-4 text-emerald-500 shrink-0" />
                      <span>First installment scheduled upon contract approval.</span>
                    </div>
                  </div>

                  {/* Applicant Recap Box */}
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2 text-xs">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <User className="size-3.5 text-emerald-500" />
                      <span>Applicant Summary</span>
                    </div>
                    <div className="text-muted-foreground">
                      <strong>Name:</strong> {form.fullName || "Not provided"}
                    </div>
                    <div className="text-muted-foreground">
                      <strong>Phone:</strong> {form.phone || "Not provided"}
                    </div>
                    {form.nationalIdReference && (
                      <div className="text-muted-foreground font-mono">
                        <strong>National ID:</strong> {form.nationalIdReference}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {mutation.isError && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  {mutation.error.message}
                </p>
              )}

              {/* Step 3 Action Bar */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="rounded-xl gap-1.5 text-xs h-10 px-4 w-full sm:w-auto"
                >
                  <ArrowLeft className="size-4" /> Back to Devices
                </Button>
                <Button
                  type="submit"
                  disabled={selected === undefined || selected.availableUnits < 1 || mutation.isPending}
                  className="rounded-xl bg-[#00DF81] text-black font-bold hover:bg-[#00DF81]/90 shadow-md shadow-emerald-500/20 text-xs px-6 h-10 gap-1.5 disabled:opacity-50 w-full sm:w-auto"
                >
                  {mutation.isPending ? "Submitting Application..." : "Submit Application ✓"}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
      <Input
        id={id}
        type={type}
        required={required}
        placeholder={placeholder}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 rounded-xl text-xs"
      />
    </div>
  );
}
