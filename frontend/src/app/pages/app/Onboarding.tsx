import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, Smartphone, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/common/AsyncState";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { apiRequest } from "../../lib/api";

interface Branch {
  id: string;
  name: string;
}

interface CatalogProduct {
  id: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  cashPrice: number;
  availableUnits: number;
  imageUrl: string | null;
}

interface Application {
  id: string;
}

interface DocumentUploadResponse {
  document: { id: string };
  upload: {
    url: string;
    headers: Record<string, string>;
  };
}

export function Onboarding() {
  const [applicationId, setApplicationId] = useState<string>();
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [form, setForm] = useState({
    branchId: "",
    fullName: "",
    phone: "",
    email: "",
    nationalIdReference: "",
    catalogProductId: "",
    downPayment: "",
    installmentCount: "6",
  });
  const branches = useQuery({
    queryKey: ["my-branches"],
    queryFn: () => apiRequest<Branch[]>("/me/branches"),
  });
  const products = useQuery({
    queryKey: ["my-products", form.branchId],
    enabled: form.branchId !== "",
    queryFn: () =>
      apiRequest<CatalogProduct[]>(
        `/me/products?branchId=${encodeURIComponent(form.branchId)}`,
      ),
  });
  const selectedProduct = products.data?.find(
    (product) => product.id === form.catalogProductId,
  );
  const createApplication = useMutation({
    mutationFn: () =>
      apiRequest<Application>("/me/applications", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.branchId,
          applicant: {
            fullName: form.fullName,
            phone: form.phone,
            email: form.email || undefined,
            nationalIdReference: form.nationalIdReference || undefined,
          },
          catalogProductId: form.catalogProductId,
          requestedTerms: {
            deviceCashPriceMinorUnits: selectedProduct?.cashPrice ?? 0,
            proposedDownPaymentMinorUnits: Number(form.downPayment),
            requestedInstallmentCount: Number(form.installmentCount),
            requestedRepaymentFrequency: "monthly",
          },
        }),
      }),
    onSuccess: (application) => setApplicationId(application.id),
  });
  const startKyc = useMutation({
    mutationFn: () =>
      apiRequest<{
        verificationUrl: string;
      }>(`/applications/${applicationId ?? ""}/kyc/session`, {
        method: "POST",
        body: JSON.stringify({
          language: "fr",
          consentAccepted: true,
          consentVersion: "customer-kyc-notice-2026-07",
        }),
      }),
    onSuccess: ({ verificationUrl }) => {
      window.location.assign(verificationUrl);
    },
  });

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "branchId" ? { catalogProductId: "" } : {}),
    }));
  }

  if (branches.isLoading) {
    return <LoadingState label="Preparing secure onboarding…" />;
  }
  if (branches.isError) {
    return <ErrorState error={branches.error} retry={() => void branches.refetch()} />;
  }

  if (applicationId !== undefined) {
    return (
      <main className="app-ambient min-h-screen p-5 text-foreground">
        <div className="mx-auto max-w-xl">
          <h1 className="text-2xl">Verify your identity</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your application was submitted. Upload the requested documents to private
            Supabase Storage, then continue to Didit.
          </p>
          <section className="mt-6 space-y-3" aria-labelledby="documents-title">
            <h2 id="documents-title" className="text-base">
              Documents
            </h2>
            <DocumentPicker
              label="National ID front"
              category="national_id_front"
              applicationId={applicationId}
              done={uploaded.includes("national_id_front")}
              onDone={() => setUploaded((current) => [...current, "national_id_front"])}
            />
            <DocumentPicker
              label="National ID back"
              category="national_id_back"
              applicationId={applicationId}
              done={uploaded.includes("national_id_back")}
              onDone={() => setUploaded((current) => [...current, "national_id_back"])}
            />
            <DocumentPicker
              label="Proof of address"
              category="proof_of_address"
              applicationId={applicationId}
              done={uploaded.includes("proof_of_address")}
              onDone={() => setUploaded((current) => [...current, "proof_of_address"])}
            />
          </section>
          <label className="mt-6 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I have read the privacy notice and consent to identity-document, selfie,
              liveness, and biometric processing by the financing provider and Didit for
              KYC.
            </span>
          </label>
          {startKyc.isError && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {startKyc.error.message}
            </p>
          )}
          <Button
            className="mt-5 w-full"
            disabled={uploaded.length < 3 || !consent || startKyc.isPending}
            busy={startKyc.isPending}
            onClick={() => startKyc.mutate()}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {startKyc.isPending ? "Opening verification…" : "Continue to Didit"}
          </Button>
        </div>
      </main>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    createApplication.mutate();
  }

  return (
    <main className="app-ambient min-h-screen p-5 text-foreground">
      <form
        onSubmit={submit}
        className="mx-auto max-w-xl space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
      >
        <div>
          <h1 className="text-2xl">Apply for device financing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your data is submitted directly to the tenant-isolated API.
          </p>
        </div>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-semibold">Your details</legend>
          <Field
            id="onboarding-name"
            label="Full name"
            value={form.fullName}
            onChange={(value) => update("fullName", value)}
            required
          />
          <Field
            id="onboarding-phone"
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(value) => update("phone", value)}
            required
          />
          <Field
            id="onboarding-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(value) => update("email", value)}
          />
          <Field
            id="onboarding-national-id"
            label="National ID reference"
            value={form.nationalIdReference}
            onChange={(value) => update("nationalIdReference", value)}
          />
          <div className="sm:col-span-2">
            <Label htmlFor="onboarding-branch">Branch</Label>
            <Select
              value={form.branchId}
              onValueChange={(value) => update("branchId", value)}
            >
              <SelectTrigger id="onboarding-branch">
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
        </fieldset>
        <fieldset>
          <legend className="mb-3 font-semibold">Available phone</legend>
          <Label htmlFor="onboarding-product">Product</Label>
          <Select
            value={form.catalogProductId}
            onValueChange={(value) => update("catalogProductId", value)}
            disabled={!form.branchId || products.isPending}
          >
            <SelectTrigger id="onboarding-product">
              <SelectValue
                placeholder={products.isPending ? "Loading stock..." : "Select product"}
              />
            </SelectTrigger>
            <SelectContent>
              {(products.data ?? []).map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.brand} {product.model} - {product.storage} - {product.color}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProduct && (
            <div className="mt-3 flex items-center gap-4 rounded-xl border border-primary/15 bg-primary/[0.05] p-4">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.brand + " " + selectedProduct.model}
                  className="size-20 rounded-xl bg-white/5 object-contain p-1"
                />
              ) : (
                <span className="grid size-20 shrink-0 place-items-center rounded-xl bg-white/5 text-muted-foreground">
                  <Smartphone className="size-8" aria-hidden="true" />
                </span>
              )}
              <div>
                <p className="font-medium">
                  {selectedProduct.brand} {selectedProduct.model}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Intl.NumberFormat("en-CM").format(selectedProduct.cashPrice)} XAF
                  {" - "}
                  {selectedProduct.availableUnits} available
                </p>
              </div>
            </div>
          )}
        </fieldset>
        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="mb-3 font-semibold">Requested plan</legend>
          <Field
            id="onboarding-down"
            label="Down payment"
            type="number"
            min="0"
            value={form.downPayment}
            onChange={(value) => update("downPayment", value)}
            required
          />
          <Field
            id="onboarding-count"
            label="Months"
            type="number"
            min="1"
            max="104"
            value={form.installmentCount}
            onChange={(value) => update("installmentCount", value)}
            required
          />
        </fieldset>
        {createApplication.isError && (
          <p className="text-sm text-destructive" role="alert">
            {createApplication.error.message}
          </p>
        )}
        <Button
          className="w-full"
          type="submit"
          disabled={
            createApplication.isPending ||
            form.branchId === "" ||
            selectedProduct === undefined
          }
          busy={createApplication.isPending}
        >
          {createApplication.isPending
            ? "Submitting application…"
            : "Submit and upload documents"}
        </Button>
      </form>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onChange(value: string): void;
  type?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "onChange" | "type"
>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...input}
      />
    </div>
  );
}

function DocumentPicker({
  label,
  category,
  applicationId,
  done,
  onDone,
}: {
  label: string;
  category: string;
  applicationId: string;
  done: boolean;
  onDone(): void;
}) {
  const mutation = useMutation({
    mutationFn: async (file: File) => {
      if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
        throw new Error("Use a JPEG, PNG, or PDF file.");
      }
      if (file.size > 20 * 1024 * 1024) {
        throw new Error("Document must be 20 MB or smaller.");
      }
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const result = await apiRequest<DocumentUploadResponse>("/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          applicationId,
          category,
          originalFileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          sha256,
        }),
      });
      const upload = await fetch(result.upload.url, {
        method: "PUT",
        headers: result.upload.headers,
        body: file,
      });
      if (!upload.ok) {
        throw new Error(`Secure upload failed with status ${upload.status}.`);
      }
      await apiRequest(`/documents/${result.document.id}/confirm`, {
        method: "POST",
      });
    },
    onSuccess: onDone,
  });
  const id = `document-${category}`;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {done && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Uploaded
          </span>
        )}
      </div>
      {!done && (
        <label
          htmlFor={id}
          className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 p-4 text-sm hover:border-primary"
        >
          <Upload className="size-4" aria-hidden="true" />
          {mutation.isPending ? "Uploading…" : "Choose file"}
          <input
            id={id}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            disabled={mutation.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) mutation.mutate(file);
            }}
          />
        </label>
      )}
      {mutation.isError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
}
