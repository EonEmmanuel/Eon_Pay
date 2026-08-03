import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  financingApplications,
  financingContracts,
  inventoryUnits,
  managedDevices,
  installments,
  paymentAllocations,
  payments,
} from "../database/schema.js";
import {
  assertInstallmentSchedule,
  canTransitionContract,
  money,
  type ContractStatus,
  type FinancingContract,
  type Installment,
} from "../domain/index.js";
import type {
  ActivateContractDto,
  CreateContractDto,
  TransitionContractDto,
} from "./contracts.dto.js";

@Injectable()
export class ContractsService {
  constructor(private readonly database: DatabaseService) {}

  list(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["contracts.read"],
      (transaction) =>
        transaction
          .select()
          .from(financingContracts)
          .where(eq(financingContracts.tenantId, tenantId))
          .orderBy(desc(financingContracts.createdAt)),
    );
  }

  get(context: AuthorizationContext, contractId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["contracts.read"],
      async (transaction) => {
        const [contract] = await transaction
          .select()
          .from(financingContracts)
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, contractId),
            ),
          )
          .limit(1);
        if (contract === undefined) {
          throw new NotFoundException("Contract not found.");
        }
        return contract;
      },
    );
  }

  schedule(context: AuthorizationContext, contractId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["installments.read"],
      (transaction) =>
        transaction
          .select({
            ...getTableColumns(installments),
            principalPaid: sql<number>`coalesce(sum(case
              when ${payments.status} = 'settled'
                and ${paymentAllocations.targetType} = 'installment_principal'
              then ${paymentAllocations.amount} else 0 end), 0)`,
            financeChargePaid: sql<number>`coalesce(sum(case
              when ${payments.status} = 'settled'
                and ${paymentAllocations.targetType} = 'installment_finance_charge'
              then ${paymentAllocations.amount} else 0 end), 0)`,
          })
          .from(installments)
          .leftJoin(
            paymentAllocations,
            and(
              eq(paymentAllocations.tenantId, installments.tenantId),
              eq(paymentAllocations.installmentId, installments.id),
            ),
          )
          .leftJoin(
            payments,
            and(
              eq(payments.tenantId, paymentAllocations.tenantId),
              eq(payments.id, paymentAllocations.paymentId),
            ),
          )
          .where(
            and(
              eq(installments.tenantId, tenantId),
              eq(installments.contractId, contractId),
            ),
          )
          .groupBy(installments.id)
          .orderBy(asc(installments.sequence)),
    );
  }

  createFromApplication(context: AuthorizationContext, input: CreateContractDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["contracts.create"],
      async (transaction) => {
        const [application] = await transaction
          .select()
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, input.applicationId),
            ),
          )
          .limit(1);
        if (application === undefined) {
          throw new NotFoundException("Application not found.");
        }
        if (
          application.status !== "approved" ||
          application.approvedTerms === null ||
          application.customerId === null
        ) {
          throw new ConflictException(
            "An approved application with a customer and approved terms is required.",
          );
        }
        if (application.convertedContractId !== null) {
          const [existing] = await transaction
            .select()
            .from(financingContracts)
            .where(
              and(
                eq(financingContracts.tenantId, tenantId),
                eq(financingContracts.id, application.convertedContractId),
              ),
            )
            .limit(1);
          return existing;
        }

        const terms = application.approvedTerms;
        const [contract] = await transaction
          .insert(financingContracts)
          .values({
            tenantId,
            branchId: application.branchId,
            customerId: application.customerId,
            sourceApplicationId: application.id,
            device: application.device,
            currency: terms.currency,
            deviceCashPrice: terms.deviceCashPrice.minorUnits,
            downPayment: terms.downPayment.minorUnits,
            financedPrincipal: terms.financedPrincipal.minorUnits,
            financeCharge: terms.financeCharge.minorUnits,
            installmentCount: terms.installmentCount,
            repaymentFrequency: terms.repaymentFrequency,
            firstDueDate: terms.firstDueDate,
            gracePeriodDays: terms.gracePeriodDays,
            status: "pending_signature",
          })
          .returning();
        if (contract === undefined) {
          throw new ConflictException("Contract could not be created.");
        }

        const updated = await transaction
          .update(financingApplications)
          .set({
            convertedContractId: contract.id,
            version: sql`${financingApplications.version} + 1`,
          })
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, application.id),
              isNull(financingApplications.convertedContractId),
            ),
          )
          .returning({ id: financingApplications.id });
        if (updated[0] === undefined) {
          throw new ConflictException("Application was converted concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "contract.created",
          "contract",
          contract.id,
          { sourceApplicationId: application.id },
        );
        return contract;
      },
    );
  }

  activate(
    context: AuthorizationContext,
    contractId: string,
    input: ActivateContractDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["contracts.activate", "devices.read", "inventory.stock.manage"],
      async (transaction) => {
        const [contract] = await transaction
          .select()
          .from(financingContracts)
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, contractId),
            ),
          )
          .limit(1);
        if (contract === undefined) {
          throw new NotFoundException("Contract not found.");
        }
        if (contract.status !== "pending_signature") {
          throw new ConflictException(
            "Only a pending-signature contract can be activated.",
          );
        }

        const [inventoryUnit] = await transaction
          .select()
          .from(inventoryUnits)
          .where(
            and(
              eq(inventoryUnits.tenantId, tenantId),
              eq(inventoryUnits.id, input.inventoryUnitId),
              eq(inventoryUnits.branchId, contract.branchId),
            ),
          )
          .limit(1);
        if (
          inventoryUnit === undefined ||
          inventoryUnit.catalogProductId !== contract.device.deviceId ||
          inventoryUnit.status !== "reserved" ||
          inventoryUnit.reservedApplicationId !== contract.sourceApplicationId
        ) {
          throw new ConflictException(
            "Select the stock unit reserved during device enrollment.",
          );
        }
        const [enrollment] = await transaction
          .select({ id: managedDevices.id })
          .from(managedDevices)
          .where(
            and(
              eq(managedDevices.tenantId, tenantId),
              eq(managedDevices.contractId, contract.id),
              eq(managedDevices.inventoryUnitId, inventoryUnit.id),
              eq(managedDevices.status, "active"),
              eq(managedDevices.deviceOwnerAttested, true),
            ),
          )
          .limit(1);
        if (enrollment === undefined) {
          throw new ConflictException(
            "Complete Device Owner enrollment and the first agent check-in before activation.",
          );
        }

        const now = new Date().toISOString();
        const signedAt = input.signedAt ?? now;
        const device = { ...contract.device, imei: inventoryUnit.imei };
        const schedule = this.generateSchedule(contract, device);

        await transaction.insert(installments).values(
          schedule.map((item) => ({
            id: item.id,
            tenantId,
            contractId,
            sequence: item.sequence,
            dueDate: item.dueDate,
            principalDue: item.principalDue.minorUnits,
            financeChargeDue: item.financeChargeDue.minorUnits,
          })),
        );
        const [activated] = await transaction
          .update(financingContracts)
          .set({
            device,
            status: "active",
            signedAt,
            activatedAt: now,
            version: sql`${financingContracts.version} + 1`,
          })
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, contractId),
              eq(financingContracts.version, contract.version),
            ),
          )
          .returning();
        if (activated === undefined) {
          throw new ConflictException("Contract changed concurrently.");
        }
        const [assignedUnit] = await transaction
          .update(inventoryUnits)
          .set({
            status: "financed",
            reservedApplicationId: null,
            contractId: contract.id,
            version: sql`${inventoryUnits.version} + 1`,
          })
          .where(
            and(
              eq(inventoryUnits.tenantId, tenantId),
              eq(inventoryUnits.id, inventoryUnit.id),
              eq(inventoryUnits.status, "reserved"),
              eq(inventoryUnits.reservedApplicationId, contract.sourceApplicationId),
              eq(inventoryUnits.version, inventoryUnit.version),
            ),
          )
          .returning({ id: inventoryUnits.id });
        if (assignedUnit === undefined) {
          throw new ConflictException("Stock unit was assigned concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "contract.activated",
          "contract",
          contract.id,
          { installmentCount: schedule.length, inventoryUnitId: inventoryUnit.id },
        );
        return { contract: activated, installments: schedule };
      },
    );
  }

  transition(
    context: AuthorizationContext,
    contractId: string,
    input: TransitionContractDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["contracts.transition"],
      async (transaction) => {
        const [current] = await transaction
          .select()
          .from(financingContracts)
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, contractId),
            ),
          )
          .limit(1);
        if (current === undefined) {
          throw new NotFoundException("Contract not found.");
        }
        if (!canTransitionContract(current.status as ContractStatus, input.status)) {
          throw new ConflictException(
            `Contract cannot transition from ${current.status} to ${input.status}.`,
          );
        }
        const now = new Date().toISOString();
        const [contract] = await transaction
          .update(financingContracts)
          .set({
            status: input.status,
            completedAt: input.status === "completed" ? now : current.completedAt,
            terminatedAt: input.status === "terminated" ? now : current.terminatedAt,
            version: sql`${financingContracts.version} + 1`,
          })
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, contractId),
              eq(financingContracts.version, current.version),
            ),
          )
          .returning();
        if (contract === undefined) {
          throw new ConflictException("Contract changed concurrently.");
        }
        await recordAudit(
          transaction,
          context,
          "contract.status_changed",
          "contract",
          contract.id,
          { from: current.status, to: input.status },
        );
        return contract;
      },
    );
  }

  private generateSchedule(
    row: typeof financingContracts.$inferSelect,
    device: typeof row.device,
  ): Installment[] {
    const contract = {
      id: row.id,
      tenantId: row.tenantId,
      branchId: row.branchId,
      customerId: row.customerId,
      sourceApplicationId: row.sourceApplicationId,
      device,
      terms: {
        currency: "XAF",
        deviceCashPrice: money(row.deviceCashPrice),
        downPayment: money(row.downPayment),
        financedPrincipal: money(row.financedPrincipal),
        financeCharge: money(row.financeCharge),
        installmentCount: row.installmentCount,
        repaymentFrequency: row.repaymentFrequency,
        firstDueDate: row.firstDueDate,
        gracePeriodDays: row.gracePeriodDays,
      },
      status: "active",
      signedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString(),
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as FinancingContract;
    const principalParts = distribute(row.financedPrincipal, row.installmentCount);
    const chargeParts = distribute(row.financeCharge, row.installmentCount);
    const rows = principalParts.map((principal, index) => ({
      id: randomUUID(),
      tenantId: row.tenantId,
      contractId: row.id,
      sequence: index + 1,
      dueDate: scheduleDate(row.firstDueDate, row.repaymentFrequency, index),
      principalDue: money(principal),
      financeChargeDue: money(chargeParts[index] ?? 0),
      createdAt: new Date().toISOString(),
    })) as Installment[];
    assertInstallmentSchedule(contract, rows);
    return rows;
  }
}

export function distribute(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from(
    { length: count },
    (_unused, index) => base + (index < remainder ? 1 : 0),
  );
}

export function scheduleDate(
  firstDueDate: string,
  frequency: "weekly" | "biweekly" | "monthly",
  offset: number,
): string {
  const [yearText, monthText, dayText] = firstDueDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (frequency !== "monthly") {
    const result = new Date(Date.UTC(year, month - 1, day));
    result.setUTCDate(result.getUTCDate() + offset * (frequency === "weekly" ? 7 : 14));
    return result.toISOString().slice(0, 10);
  }

  const targetMonthIndex = month - 1 + offset;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
}
