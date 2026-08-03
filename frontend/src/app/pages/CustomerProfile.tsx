import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Mail, MessageSquare, Phone } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { ErrorState, LoadingState } from "../components/common/AsyncState";
import { GlassCard } from "../components/common/GlassCard";
import { SectionCard } from "../components/common/SectionCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { getTenantAnalytics, tenantAnalyticsQueryKey } from "../lib/analytics";
import { apiRequest } from "../lib/api";
import { dateTime, money } from "../lib/format";

interface CustomerDocument {
  id: string;
  customerId: string | null;
  category: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: string | null;
}

export function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const analytics = useQuery({
    queryKey: tenantAnalyticsQueryKey,
    queryFn: getTenantAnalytics,
  });
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiRequest<CustomerDocument[]>("/documents"),
  });

  if (analytics.isPending) return <LoadingState label="Loading customer…" />;
  if (analytics.isError)
    return (
      <ErrorState error={analytics.error} retry={() => void analytics.refetch()} />
    );
  const customer = analytics.data.customers.find((row) => row.id === id);
  if (customer === undefined)
    return <ErrorState error={new Error("Customer not found.")} />;

  const contracts = analytics.data.contracts.filter(
    (row) => row.customerId === customer.id,
  );
  const payments = analytics.data.payments.filter(
    (row) => row.customerId === customer.id,
  );
  const customerDocuments = (documents.data ?? []).filter(
    (row) => row.customerId === customer.id,
  );
  const contractIds = new Set(contracts.map((row) => row.id));
  const activity = analytics.data.activity.filter(
    (row) =>
      row.resourceId === customer.id ||
      (row.resourceId !== null && contractIds.has(row.resourceId)),
  );

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate("/customers")}
      >
        <ArrowLeft className="size-4" /> Back to customers
      </Button>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassCard className="h-fit text-center" glow="emerald">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-primary/15 text-xl font-bold text-primary">
            {initials(customer.fullName)}
          </div>
          <h1 className="mt-3 text-xl">{customer.fullName}</h1>
          <div className="font-mono text-xs text-muted-foreground">{customer.id}</div>
          <div className="mt-3 flex justify-center gap-2">
            <StatusBadge
              tone={customer.kycStatus === "verified" ? "success" : "warning"}
            >
              {customer.kycStatus.replaceAll("_", " ")} KYC
            </StatusBadge>
            <StatusBadge tone={customer.status === "overdue" ? "danger" : "info"}>
              {customer.status}
            </StatusBadge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <Metric label="Outstanding" value={money(customer.outstanding)} />
            <Metric label="Contracts" value={String(customer.contractCount)} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button asChild className="flex-1">
              <a href={`tel:${customer.phone}`}>
                <Phone className="size-4" /> Call
              </a>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <a href={`sms:${customer.phone}`}>
                <MessageSquare className="size-4" /> Message
              </a>
            </Button>
          </div>
          <div className="mt-4 space-y-2 border-t border-white/8 pt-4 text-left text-sm">
            <div className="flex gap-2">
              <Phone className="mt-0.5 size-4 text-muted-foreground" />
              <span>{customer.phone}</span>
            </div>
            <div className="flex gap-2">
              <Mail className="mt-0.5 size-4 text-muted-foreground" />
              <span>{customer.email ?? "No email recorded"}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Joined {dateTime(customer.createdAt)} · {customer.branchName}
            </div>
          </div>
        </GlassCard>

        <div className="xl:col-span-2">
          <Tabs defaultValue="contracts">
            <TabsList className="mb-4 flex-wrap bg-white/[0.03]">
              <TabsTrigger value="contracts">Contracts</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="contracts">
              <SectionCard bodyClassName="p-0">
                {contracts.length === 0 ? (
                  <Empty label="No contracts recorded." />
                ) : (
                  <div className="divide-y divide-white/6">
                    {contracts.map((contract) => (
                      <button
                        key={contract.id}
                        onClick={() => navigate(`/contracts/${contract.id}`)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.03]"
                      >
                        <div>
                          <div className="font-medium">
                            {contract.device.brand} {contract.device.model}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {contract.id}
                          </div>
                        </div>
                        <div className="text-right">
                          <StatusBadge
                            tone={contract.overdueInstallments > 0 ? "danger" : "info"}
                          >
                            {contract.status}
                          </StatusBadge>
                          <div className="mt-1 font-mono text-xs">
                            {money(contract.outstanding)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </SectionCard>
            </TabsContent>
            <TabsContent value="payments">
              <SectionCard bodyClassName="p-0">
                {payments.length === 0 ? (
                  <Empty label="No payments recorded." />
                ) : (
                  <div className="divide-y divide-white/6">
                    {payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between px-5 py-3"
                      >
                        <div>
                          <div className="font-mono text-sm">{payment.id}</div>
                          <div className="text-xs text-muted-foreground">
                            {payment.channel} ·{" "}
                            {dateTime(payment.settledAt ?? payment.initiatedAt)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono">{money(payment.amount)}</div>
                          <StatusBadge
                            tone={payment.status === "settled" ? "success" : "warning"}
                          >
                            {payment.status}
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </TabsContent>
            <TabsContent value="documents">
              {documents.isPending ? (
                <LoadingState label="Loading documents…" />
              ) : documents.isError ? (
                <ErrorState
                  error={documents.error}
                  retry={() => void documents.refetch()}
                />
              ) : customerDocuments.length === 0 ? (
                <SectionCard>
                  <Empty label="No documents recorded for this customer." />
                </SectionCard>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customerDocuments.map((document) => (
                    <SectionCard key={document.id}>
                      <div className="flex items-start gap-3">
                        <FileText className="size-5 text-primary" />
                        <div>
                          <div className="font-medium">{document.category}</div>
                          <div className="text-xs text-muted-foreground">
                            {document.originalFileName}
                          </div>
                          <div className="mt-1 text-xs">
                            {document.status} · {Math.round(document.sizeBytes / 1024)}{" "}
                            KB
                          </div>
                        </div>
                      </div>
                    </SectionCard>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="timeline">
              <SectionCard>
                {activity.length === 0 ? (
                  <Empty label="No audited customer activity recorded." />
                ) : (
                  <div className="space-y-4">
                    {activity.map((event) => (
                      <div key={event.id} className="border-l-2 border-primary/40 pl-4">
                        <div className="font-medium">{event.message}</div>
                        <div className="text-xs text-muted-foreground">
                          {dateTime(event.occurredAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-muted-foreground">{label}</div>
  );
}
