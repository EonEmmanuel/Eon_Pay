import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Circle,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAuth } from "../lib/auth";
import {
  getTenantKyb,
  isProviderDecisionPending,
  startTenantKyb,
  tenantKybQueryKey,
} from "../lib/kyb";
import {
  businessProfileQueryKey,
  getBusinessProfile,
  updateBusinessProfile,
  type RetailerBusinessProfileInput,
  type TenantOnboardingStatus,
} from "../lib/organization";

const emptyProfile: RetailerBusinessProfileInput = {
  legalName: "",
  tradingName: "",
  legalForm: "limited_liability_company",
  registrationNumber: "",
  taxIdentificationNumber: "",
  countryCode: "CM",
  registeredAddressLine1: "",
  registeredAddressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  contactEmail: "",
  contactPhone: "",
  websiteUrl: "",
  incorporationDate: "",
  baseCurrency: "XAF",
};

const legalForms = [
  ["sole_proprietorship", "Sole proprietorship"],
  ["limited_liability_company", "Limited liability company"],
  ["public_limited_company", "Public limited company"],
  ["partnership", "Partnership"],
  ["cooperative", "Cooperative"],
  ["other", "Other"],
] as const;

export function BusinessProfile() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const queryKey = businessProfileQueryKey(auth.tenantId);
  const profileQuery = useQuery({ queryKey, queryFn: getBusinessProfile });
  const kybQueryKey = tenantKybQueryKey(auth.tenantId);
  const kybQuery = useQuery({
    queryKey: kybQueryKey,
    queryFn: getTenantKyb,
    enabled: profileQuery.data?.profile !== null,
    refetchInterval: (currentQuery) => {
      const current = currentQuery.state.data;
      return current?.pollingFallbackEnabled &&
        isProviderDecisionPending(current.case?.status)
        ? 10_000
        : false;
    },
  });
  const [form, setForm] = useState<RetailerBusinessProfileInput>(emptyProfile);

  useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (profile !== undefined && profile !== null) {
      setForm({
        legalName: profile.legalName,
        tradingName: profile.tradingName ?? "",
        legalForm: profile.legalForm,
        registrationNumber: profile.registrationNumber,
        taxIdentificationNumber: profile.taxIdentificationNumber,
        countryCode: profile.countryCode,
        registeredAddressLine1: profile.registeredAddressLine1,
        registeredAddressLine2: profile.registeredAddressLine2 ?? "",
        city: profile.city,
        region: profile.region ?? "",
        postalCode: profile.postalCode ?? "",
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        websiteUrl: profile.websiteUrl ?? "",
        incorporationDate: profile.incorporationDate ?? "",
        baseCurrency: profile.baseCurrency,
      });
    }
  }, [profileQuery.data?.profile]);

  const saveMutation = useMutation({
    mutationFn: updateBusinessProfile,
    onSuccess: async (response) => {
      queryClient.setQueryData(queryKey, response);
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        response.onboardingStatus === "kyb_required"
          ? "Business profile saved. KYB verification is the next step."
          : "Business profile saved.",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const startKyb = useMutation({
    mutationFn: () => startTenantKyb("en"),
    onSuccess: (response) => {
      queryClient.setQueryData(kybQueryKey, {
        configured: true,
        pollingFallbackEnabled: kybQuery.data?.pollingFallbackEnabled ?? false,
        onboardingStatus: "kyb_in_review",
        case: response.case,
      });
      window.location.assign(response.verificationUrl);
    },
    onError: (error) => toast.error(error.message),
  });

  function update<K extends keyof RetailerBusinessProfileInput>(
    field: K,
    value: RetailerBusinessProfileInput[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate(form);
  }
  const verificationUrl = kybQuery.data?.case?.verificationUrl;

  if (profileQuery.isPending) {
    return <LoadingState label="Loading retailer business profile..." />;
  }
  if (profileQuery.isError) {
    return (
      <ErrorState
        error={profileQuery.error}
        retry={() => void profileQuery.refetch()}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Business profile"
        subtitle="Authoritative legal and contact details for retailer verification"
        breadcrumb={["Administration", "Business profile"]}
      />
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <SectionCard
          title="Onboarding progress"
          subtitle={profileQuery.data.tenantName}
        >
          <div className="space-y-4">
            <OnboardingStep
              label="Business profile"
              complete={profileQuery.data.profile !== null}
              active={
                profileQuery.data.onboardingStatus === "business_profile_required"
              }
            />
            <OnboardingStep
              label="KYB verification"
              complete={isPastKyb(profileQuery.data.onboardingStatus)}
              active={
                profileQuery.data.onboardingStatus === "kyb_required" ||
                profileQuery.data.onboardingStatus === "kyb_in_review"
              }
            />
            <OnboardingStep
              label="Branches and configuration"
              complete={profileQuery.data.onboardingStatus === "active"}
              active={
                profileQuery.data.onboardingStatus === "branch_setup_required" ||
                profileQuery.data.onboardingStatus === "configuration_required"
              }
            />
            <div className="pt-2">
              <StatusBadge
                tone={
                  profileQuery.data.onboardingStatus === "active"
                    ? "success"
                    : "warning"
                }
              >
                {profileQuery.data.onboardingStatus.replaceAll("_", " ")}
              </StatusBadge>
            </div>
          </div>
        </SectionCard>
        <SectionCard
          title="Why this information is required"
          subtitle="It identifies the legal business that operates this tenant."
        >
          <div className="flex gap-3 text-sm text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p>
              Registration and tax identifiers are stored once per retailer and checked
              for duplicates across the platform. Only retailer owners, tenant
              administrators, and authorized platform staff can access this record.
            </p>
          </div>
        </SectionCard>
      </div>

      {profileQuery.data.profile !== null && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-foreground/5 to-transparent p-5 shadow-[0_24px_80px_-40px_oklch(0.78_0.15_168/0.6)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/20">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">Didit business verification</h2>
                  {kybQuery.data?.case !== null &&
                    kybQuery.data?.case !== undefined && (
                      <StatusBadge
                        tone={
                          kybQuery.data.case.status === "approved"
                            ? "success"
                            : kybQuery.data.case.status === "rejected" ||
                                kybQuery.data.case.status === "provider_declined"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {kybQuery.data.case.status.replaceAll("_", " ")}
                      </StatusBadge>
                    )}
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Verify the company registry, corporate documents, beneficial owners,
                  officers and AML screening. You will return here after the secure
                  hosted flow.
                </p>
                {kybQuery.data?.case?.decisionReason !== null &&
                  kybQuery.data?.case?.decisionReason !== undefined && (
                    <p className="mt-2 text-sm text-amber-300">
                      {kybQuery.data.case.decisionReason}
                    </p>
                  )}
              </div>
            </div>
            <div className="shrink-0">
              {kybQuery.isPending ? (
                <Button disabled>Checking KYB...</Button>
              ) : kybQuery.data?.configured === false ? (
                <StatusBadge tone="danger">Provider setup required</StatusBadge>
              ) : verificationUrl !== null &&
                verificationUrl !== undefined &&
                !["approved", "rejected"].includes(
                  kybQuery.data?.case?.status ?? "",
                ) ? (
                <Button onClick={() => window.location.assign(verificationUrl)}>
                  Resume verification <ExternalLink className="size-4" />
                </Button>
              ) : kybQuery.data?.case?.status === "approved" ? (
                <StatusBadge tone="success">Verification complete</StatusBadge>
              ) : (
                <Button
                  disabled={startKyb.isPending}
                  busy={startKyb.isPending}
                  onClick={() => startKyb.mutate()}
                >
                  {startKyb.isPending
                    ? "Creating secure session..."
                    : "Start KYB verification"}
                  <ExternalLink className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit}>
        <SectionCard
          title="Legal business details"
          subtitle="Use the information shown on the official registration documents."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Legal name" id="legal-name" required>
              <Input
                id="legal-name"
                required
                minLength={2}
                maxLength={180}
                value={form.legalName}
                onChange={(event) => update("legalName", event.target.value)}
              />
            </Field>
            <Field label="Trading name" id="trading-name">
              <Input
                id="trading-name"
                maxLength={180}
                value={form.tradingName}
                onChange={(event) => update("tradingName", event.target.value)}
              />
            </Field>
            <Field label="Legal form" id="legal-form" required>
              <select
                id="legal-form"
                required
                className="h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm"
                value={form.legalForm}
                onChange={(event) =>
                  update(
                    "legalForm",
                    event.target.value as RetailerBusinessProfileInput["legalForm"],
                  )
                }
              >
                {legalForms.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Incorporation date" id="incorporation-date">
              <Input
                id="incorporation-date"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.incorporationDate}
                onChange={(event) => update("incorporationDate", event.target.value)}
              />
            </Field>
            <Field label="Registration number (RCCM)" id="registration-number" required>
              <Input
                id="registration-number"
                required
                minLength={3}
                maxLength={80}
                value={form.registrationNumber}
                onChange={(event) =>
                  update("registrationNumber", event.target.value.toUpperCase())
                }
              />
            </Field>
            <Field label="Tax identification number (NIU)" id="tax-number" required>
              <Input
                id="tax-number"
                required
                minLength={3}
                maxLength={80}
                value={form.taxIdentificationNumber}
                onChange={(event) =>
                  update("taxIdentificationNumber", event.target.value.toUpperCase())
                }
              />
            </Field>
            <Field label="Country" id="country-code">
              <Input id="country-code" value="Cameroon (CM)" disabled />
            </Field>
            <Field label="Base currency" id="base-currency">
              <Input
                id="base-currency"
                value="Central African CFA franc (XAF)"
                disabled
              />
            </Field>
          </div>
        </SectionCard>

        <div className="mt-5">
          <SectionCard
            title="Registered address and contact"
            subtitle="The official address and primary compliance contact."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Registered address"
                id="address-line-1"
                required
                className="md:col-span-2"
              >
                <Textarea
                  id="address-line-1"
                  required
                  minLength={3}
                  maxLength={240}
                  value={form.registeredAddressLine1}
                  onChange={(event) =>
                    update("registeredAddressLine1", event.target.value)
                  }
                />
              </Field>
              <Field
                label="Address line 2"
                id="address-line-2"
                className="md:col-span-2"
              >
                <Input
                  id="address-line-2"
                  maxLength={240}
                  value={form.registeredAddressLine2}
                  onChange={(event) =>
                    update("registeredAddressLine2", event.target.value)
                  }
                />
              </Field>
              <Field label="City" id="city" required>
                <Input
                  id="city"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                />
              </Field>
              <Field label="Region" id="region">
                <Input
                  id="region"
                  maxLength={120}
                  value={form.region}
                  onChange={(event) => update("region", event.target.value)}
                />
              </Field>
              <Field label="Postal code" id="postal-code">
                <Input
                  id="postal-code"
                  maxLength={32}
                  value={form.postalCode}
                  onChange={(event) => update("postalCode", event.target.value)}
                />
              </Field>
              <Field label="Contact email" id="contact-email" required>
                <Input
                  id="contact-email"
                  type="email"
                  required
                  maxLength={254}
                  value={form.contactEmail}
                  onChange={(event) => update("contactEmail", event.target.value)}
                />
              </Field>
              <Field label="Contact phone" id="contact-phone" required>
                <Input
                  id="contact-phone"
                  type="tel"
                  required
                  pattern="\+[1-9][0-9]{7,14}"
                  placeholder="+237600000000"
                  value={form.contactPhone}
                  onChange={(event) => update("contactPhone", event.target.value)}
                />
              </Field>
              <Field label="Website" id="website-url">
                <Input
                  id="website-url"
                  type="url"
                  maxLength={500}
                  placeholder="https://example.com"
                  value={form.websiteUrl}
                  onChange={(event) => update("websiteUrl", event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                busy={saveMutation.isPending}
              >
                <Building2 className="size-4" aria-hidden="true" />
                {saveMutation.isPending ? "Saving..." : "Save business profile"}
              </Button>
            </div>
          </SectionCard>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  id,
  required,
  className,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function OnboardingStep({
  label,
  complete,
  active,
}: {
  label: string;
  complete: boolean;
  active: boolean;
}) {
  const Icon = complete ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3">
      <Icon
        className={
          complete
            ? "size-5 text-primary"
            : active
              ? "size-5 text-amber-400"
              : "size-5 text-muted-foreground"
        }
        aria-hidden="true"
      />
      <span
        className={
          active ? "font-medium text-foreground" : "text-sm text-muted-foreground"
        }
      >
        {label}
      </span>
    </div>
  );
}

function isPastKyb(status: TenantOnboardingStatus) {
  return [
    "branch_setup_required",
    "configuration_required",
    "pending_approval",
    "active",
  ].includes(status);
}
