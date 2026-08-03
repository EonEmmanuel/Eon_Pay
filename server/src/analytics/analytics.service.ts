import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  auditEvents,
  branches,
  customers,
  financingApplications,
  financingContracts,
  installments,
  managedDevices,
  paymentAllocations,
  payments,
  platformSettings,
} from "../database/schema.js";
import { readableAuditSummary } from "../ledger/audit-presentation.js";
import { DiditProvider } from "../providers/didit.provider.js";
import { EsperMdmProvider } from "../providers/esper.provider.js";
import { SupabaseInvitationsProvider } from "../providers/supabase-invitations.provider.js";
import { SupabaseStorageProvider } from "../providers/storage.provider.js";
import type { PlatformSettingKey, UpdatePlatformSettingDto } from "./analytics.dto.js";

export interface PlatformAnalyticsResult extends Record<string, unknown> {
  data: PlatformAnalytics;
}

export interface PlatformAnalytics {
  generatedAt: string;
  summary: Record<string, number>;
  tenants: Array<Record<string, unknown>>;
  monthly: Array<Record<string, unknown>>;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly didit: DiditProvider,
    private readonly mdm: EsperMdmProvider,
    private readonly storage: SupabaseStorageProvider,
    private readonly invitations: SupabaseInvitationsProvider,
  ) {}

  tenant(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["customers.read", "contracts.read", "installments.read"],
      async (transaction) => {
        const branchRows = await transaction
          .select()
          .from(branches)
          .where(eq(branches.tenantId, tenantId))
          .orderBy(asc(branches.name));
        const customerRows = await transaction
          .select()
          .from(customers)
          .where(eq(customers.tenantId, tenantId))
          .orderBy(asc(customers.fullName));
        const applicationRows = await transaction
          .select()
          .from(financingApplications)
          .where(eq(financingApplications.tenantId, tenantId))
          .orderBy(desc(financingApplications.createdAt));
        const contractRows = await transaction
          .select()
          .from(financingContracts)
          .where(eq(financingContracts.tenantId, tenantId))
          .orderBy(desc(financingContracts.createdAt));
        const installmentRows = await transaction
          .select()
          .from(installments)
          .where(eq(installments.tenantId, tenantId))
          .orderBy(asc(installments.dueDate));
        const paymentRows = await transaction
          .select()
          .from(payments)
          .where(eq(payments.tenantId, tenantId))
          .orderBy(desc(payments.initiatedAt));
        const allocationRows = await transaction
          .select()
          .from(paymentAllocations)
          .where(eq(paymentAllocations.tenantId, tenantId));
        const deviceRows = await transaction
          .select()
          .from(managedDevices)
          .where(eq(managedDevices.tenantId, tenantId))
          .orderBy(desc(managedDevices.createdAt));
        const activityRows = await transaction
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.tenantId, tenantId))
          .orderBy(desc(auditEvents.occurredAt))
          .limit(30);

        const customerById = new Map(customerRows.map((row) => [row.id, row]));
        const branchById = new Map(branchRows.map((row) => [row.id, row]));
        const contractById = new Map(contractRows.map((row) => [row.id, row]));
        const installmentsByContract = groupBy(
          installmentRows,
          (row) => row.contractId,
        );
        const contractsByCustomer = groupBy(contractRows, (row) => row.customerId);
        const applicationsByCustomer = groupBy(
          applicationRows.filter((row) => row.customerId !== null),
          (row) => row.customerId as string,
        );
        const allocationsByInstallment = sumByKey(
          allocationRows.filter((row) => row.installmentId !== null),
          (row) => row.installmentId as string,
          (row) => row.amount,
        );
        const directAllocationsByContract = sumByKey(
          allocationRows.filter(
            (row) => row.contractId !== null && row.installmentId === null,
          ),
          (row) => row.contractId as string,
          (row) => row.amount,
        );
        const today = new Date().toISOString().slice(0, 10);

        const enrichedContracts = contractRows.map((contract) => {
          const schedule = installmentsByContract.get(contract.id) ?? [];
          const installmentPaid = schedule.reduce(
            (total, item) => total + (allocationsByInstallment.get(item.id) ?? 0),
            0,
          );
          const paidAmount =
            installmentPaid + (directAllocationsByContract.get(contract.id) ?? 0);
          const totalDue = contract.financedPrincipal + contract.financeCharge;
          const outstanding = Math.max(0, totalDue - paidAmount);
          const paidInstallments = schedule.filter(
            (item) =>
              (allocationsByInstallment.get(item.id) ?? 0) >=
              item.principalDue + item.financeChargeDue,
          ).length;
          const nextDue = schedule.find(
            (item) =>
              (allocationsByInstallment.get(item.id) ?? 0) <
              item.principalDue + item.financeChargeDue,
          );
          const overdueInstallments = schedule.filter(
            (item) =>
              item.dueDate < today &&
              (allocationsByInstallment.get(item.id) ?? 0) <
                item.principalDue + item.financeChargeDue,
          ).length;
          return {
            ...contract,
            customerName:
              customerById.get(contract.customerId)?.fullName ?? "Unknown customer",
            branchName: branchById.get(contract.branchId)?.name ?? "Unknown branch",
            paidAmount,
            outstanding,
            paidInstallments,
            nextDueDate: nextDue?.dueDate ?? null,
            overdueInstallments,
          };
        });
        const enrichedContractById = new Map(
          enrichedContracts.map((row) => [row.id, row]),
        );

        const collections = installmentRows
          .map((item) => {
            const contract = enrichedContractById.get(item.contractId);
            const dueAmount = item.principalDue + item.financeChargeDue;
            const allocated = allocationsByInstallment.get(item.id) ?? 0;
            const outstanding = Math.max(0, dueAmount - allocated);
            const daysOverdue = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(`${item.dueDate}T00:00:00Z`).getTime()) /
                  86_400_000,
              ),
            );
            return {
              ...item,
              customerId: contract?.customerId ?? null,
              customerName: contract?.customerName ?? "Unknown customer",
              device: contract?.device ?? null,
              outstanding,
              daysOverdue,
            };
          })
          .filter((item) => item.dueDate < today && item.outstanding > 0)
          .sort((left, right) => right.daysOverdue - left.daysOverdue);

        const enrichedCustomers = customerRows.map((customer) => {
          const relatedContracts = contractsByCustomer.get(customer.id) ?? [];
          const summaries = relatedContracts
            .map((contract) => enrichedContractById.get(contract.id))
            .filter((value) => value !== undefined);
          const outstanding = summaries.reduce(
            (total, contract) => total + contract.outstanding,
            0,
          );
          const latestApplication = (applicationsByCustomer.get(customer.id) ?? [])[0];
          const hasOverdue = summaries.some(
            (contract) => contract.overdueInstallments > 0,
          );
          const allComplete =
            summaries.length > 0 &&
            summaries.every((contract) => contract.status === "completed");
          return {
            ...customer,
            branchName:
              branchById.get(relatedContracts[0]?.branchId ?? "")?.name ??
              branchRows[0]?.name ??
              "Unassigned",
            kycStatus: latestApplication?.kycStatus ?? "not_started",
            status: hasOverdue
              ? "overdue"
              : allComplete
                ? "completed"
                : summaries.length > 0
                  ? "active"
                  : "prospect",
            outstanding,
            contractCount: summaries.length,
          };
        });

        const enrichedDevices = deviceRows.map((device) => {
          const contract = contractById.get(device.contractId);
          return {
            ...device,
            device: contract?.device ?? null,
            customerId: contract?.customerId ?? null,
            customerName:
              customerById.get(contract?.customerId ?? "")?.fullName ??
              "Unknown customer",
          };
        });

        const branchesWithMetrics = branchRows.map((branch) => {
          const branchContracts = enrichedContracts.filter(
            (contract) => contract.branchId === branch.id,
          );
          const financed = branchContracts.reduce(
            (total, contract) => total + contract.financedPrincipal,
            0,
          );
          const collected = branchContracts.reduce(
            (total, contract) => total + contract.paidAmount,
            0,
          );
          return {
            ...branch,
            contractCount: branchContracts.length,
            financed,
            collected,
            collectionRate: financed === 0 ? 0 : (collected / financed) * 100,
          };
        });

        const monthly = lastMonths(12).map(({ key, label }) => ({
          month: label,
          financed: enrichedContracts
            .filter((contract) => contract.createdAt.startsWith(key))
            .reduce((total, contract) => total + contract.financedPrincipal, 0),
          collected: paymentRows
            .filter(
              (payment) =>
                payment.status === "settled" && payment.settledAt?.startsWith(key),
            )
            .reduce((total, payment) => total + payment.amount, 0),
        }));
        const modelPerformance = Array.from(
          groupBy(
            enrichedContracts,
            (contract) => `${contract.device.brand} ${contract.device.model}`,
          ),
        ).map(([model, rows]) => ({
          model,
          units: rows.length,
          financed: rows.reduce(
            (total, contract) => total + contract.financedPrincipal,
            0,
          ),
        }));

        const settledPayments = paymentRows.filter(
          (payment) => payment.status === "settled",
        );
        const financedVolume = enrichedContracts.reduce(
          (total, contract) => total + contract.financedPrincipal,
          0,
        );
        const collectedVolume = settledPayments.reduce(
          (total, payment) => total + payment.amount,
          0,
        );
        const outstandingPortfolio = enrichedContracts.reduce(
          (total, contract) => total + contract.outstanding,
          0,
        );

        return {
          generatedAt: new Date().toISOString(),
          summary: {
            customers: customerRows.length,
            contracts: contractRows.length,
            activeContracts: contractRows.filter((row) => row.status === "active")
              .length,
            overdueContracts: enrichedContracts.filter(
              (row) => row.overdueInstallments > 0,
            ).length,
            pendingApplications: applicationRows.filter((row) =>
              ["submitted", "kyc_review", "credit_review"].includes(row.status),
            ).length,
            financedVolume,
            collectedVolume,
            outstandingPortfolio,
            collectionRate:
              financedVolume === 0 ? 0 : (collectedVolume / financedVolume) * 100,
            managedDevices: deviceRows.length,
            restrictedDevices: deviceRows.filter((row) => row.status === "restricted")
              .length,
          },
          branches: branchesWithMetrics,
          customers: enrichedCustomers,
          applications: applicationRows,
          contracts: enrichedContracts,
          installments: installmentRows.map((item) => {
            const dueAmount = item.principalDue + item.financeChargeDue;
            const paidAmount = allocationsByInstallment.get(item.id) ?? 0;
            const outstanding = Math.max(0, dueAmount - paidAmount);
            return {
              ...item,
              paidAmount,
              outstanding,
              status:
                outstanding === 0
                  ? "paid"
                  : item.dueDate < today
                    ? "overdue"
                    : item.dueDate === today
                      ? "due"
                      : "upcoming",
            };
          }),
          collections,
          payments: paymentRows.map((payment) => ({
            ...payment,
            customerName:
              customerById.get(payment.customerId)?.fullName ?? "Unknown customer",
          })),
          devices: enrichedDevices,
          monthly,
          modelPerformance,
          activity: activityRows.map(readableAuditSummary),
        };
      },
    );
  }

  async platform(context: AuthorizationContext): Promise<PlatformAnalytics> {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.tenants.read"],
      async (transaction) => {
        const result = await transaction.execute<PlatformAnalyticsResult>(sql`
          select public.app_platform_analytics() as data
        `);
        const value = result.rows[0]?.data;
        if (value === undefined) {
          throw new NotFoundException("Platform analytics are unavailable.");
        }
        return value;
      },
    );
  }

  settings(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      [],
      async (transaction) => {
        const defaults = defaultPlatformSettings(context.user.id).filter((setting) =>
          setting.key === "general"
            ? context.permissions.has("platform.settings.manage")
            : context.permissions.has("platform.risk.manage"),
        );
        if (defaults.length > 0) {
          await transaction
            .insert(platformSettings)
            .values(defaults)
            .onConflictDoNothing();
        }
        return transaction
          .select()
          .from(platformSettings)
          .orderBy(asc(platformSettings.key));
      },
    );
  }

  updateSetting(
    context: AuthorizationContext,
    key: PlatformSettingKey,
    input: UpdatePlatformSettingDto,
  ) {
    const value = validateSetting(key, input.value);
    const permission =
      key === "general" ? "platform.settings.manage" : "platform.risk.manage";
    return this.database.withPlatformTransaction(
      context.user.id,
      [permission],
      async (transaction) => {
        const [updated] = await transaction
          .update(platformSettings)
          .set({
            value,
            version: sql`${platformSettings.version} + 1`,
            updatedBy: context.user.id,
          })
          .where(
            and(
              eq(platformSettings.key, key),
              eq(platformSettings.version, input.version),
            ),
          )
          .returning();
        if (updated === undefined) {
          throw new ConflictException(
            "Platform settings changed. Reload before saving again.",
          );
        }
        await recordAudit(
          transaction,
          context,
          "platform.settings.updated",
          "platform_setting",
          key,
          { version: updated.version },
        );
        return updated;
      },
    );
  }

  async systemHealth(context: AuthorizationContext) {
    await this.database.authorizePlatform(context.user.id, ["platform.health.read"]);
    const started = Date.now();
    let databaseStatus: "operational" | "down" = "operational";
    try {
      await this.database.healthCheck();
    } catch {
      databaseStatus = "down";
    }
    return {
      checkedAt: new Date().toISOString(),
      services: [
        { name: "API", status: "operational", detail: "NestJS application" },
        {
          name: "PostgreSQL",
          status: databaseStatus,
          detail: `${Date.now() - started} ms health query`,
        },
        {
          name: "Supabase Auth email",
          status: this.invitations.configured ? "operational" : "not_configured",
          detail: "Owner and staff invitation delivery",
        },
        {
          name: "Supabase document storage",
          status: this.storage.configured ? "operational" : "not_configured",
          detail: "Private KYC document objects",
        },
        {
          name: "Didit KYC",
          status: this.didit.configured ? "operational" : "not_configured",
          detail: "Customer identity verification sessions",
        },
        {
          name: "Didit KYB",
          status: this.didit.kybConfigured ? "operational" : "not_configured",
          detail: "Retailer business verification and compliance evidence",
        },
        {
          name: "Esper MDM",
          status: this.mdm.configured ? "operational" : "not_configured",
          detail: "Managed-device commands",
        },
      ],
    };
  }
}

function groupBy<Row, Key>(rows: readonly Row[], key: (row: Row) => Key) {
  const groups = new Map<Key, Row[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}

function sumByKey<Row, Key>(
  rows: readonly Row[],
  key: (row: Row) => Key,
  amount: (row: Row) => number,
) {
  const sums = new Map<Key, number>();
  for (const row of rows) {
    const value = key(row);
    sums.set(value, (sums.get(value) ?? 0) + amount(row));
  }
  return sums;
}

function lastMonths(count: number) {
  const result: Array<{ key: string; label: string }> = [];
  const current = new Date();
  current.setUTCDate(1);
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - offset, 1),
    );
    result.push({
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(date),
    });
  }
  return result;
}

function defaultPlatformSettings(userId: string) {
  return [
    {
      key: "general",
      value: {
        platformName: "Investor Ready",
        baseDomain: "localhost",
        accentColor: "oklch(0.76 0.15 168)",
        notificationsEmail: "ops@example.com",
        toggles: {
          whiteLabelBranding: false,
          customDomains: false,
          requireStaffMfa: true,
          weeklyDigestEmails: false,
        },
      },
      updatedBy: userId,
    },
    {
      key: "risk_rules",
      value: {
        version: 1,
        rules: [
          {
            id: "minimum-down-payment",
            name: "Minimum down payment",
            value: "20%",
            scope: "Global",
            enabled: true,
          },
          {
            id: "maximum-term",
            name: "Maximum repayment term",
            value: "12 months",
            scope: "Global",
            enabled: true,
          },
          {
            id: "manual-review-threshold",
            name: "Manual review threshold",
            value: "Risk score 60",
            scope: "Global",
            enabled: true,
          },
        ],
      },
      updatedBy: userId,
    },
  ];
}
function validateSetting(
  key: PlatformSettingKey,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (key === "general") {
    const platformName = requiredString(value.platformName, "platformName", 2, 120);
    const baseDomain = requiredString(value.baseDomain, "baseDomain", 1, 253);
    const accentColor = requiredString(value.accentColor, "accentColor", 3, 80);
    const notificationsEmail = requiredString(
      value.notificationsEmail,
      "notificationsEmail",
      3,
      254,
    );
    const toggles = value.toggles;
    if (toggles === null || typeof toggles !== "object" || Array.isArray(toggles)) {
      throw new ConflictException("general.toggles must be an object.");
    }
    return {
      platformName,
      baseDomain,
      accentColor,
      notificationsEmail,
      toggles: Object.fromEntries(
        Object.entries(toggles).map(([toggleKey, enabled]) => {
          if (typeof enabled !== "boolean") {
            throw new ConflictException(`Toggle ${toggleKey} must be boolean.`);
          }
          return [toggleKey, enabled];
        }),
      ),
    };
  }

  const version = value.version;
  const rules = value.rules;
  if (!Number.isInteger(version) || typeof version !== "number" || version < 1) {
    throw new ConflictException("risk_rules.version must be a positive integer.");
  }
  if (!Array.isArray(rules) || rules.length > 50) {
    throw new ConflictException("risk_rules.rules must contain at most 50 rules.");
  }
  return {
    version,
    rules: rules.map((rule, index) => {
      if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
        throw new ConflictException(`Risk rule ${index + 1} is invalid.`);
      }
      const candidate = rule as Record<string, unknown>;
      if (typeof candidate.enabled !== "boolean") {
        throw new ConflictException(`Risk rule ${index + 1} enabled must be boolean.`);
      }
      return {
        id: requiredString(candidate.id, "id", 1, 80),
        name: requiredString(candidate.name, "name", 2, 160),
        value: requiredString(candidate.value, "value", 1, 160),
        scope: requiredString(candidate.scope, "scope", 2, 80),
        enabled: candidate.enabled,
      };
    }),
  };
}

function requiredString(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new ConflictException(`${name} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ConflictException(`${name} has an invalid length.`);
  }
  return normalized;
}
