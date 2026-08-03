import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import {
  claimIdempotencyKey,
  recordAudit,
  tenantIdFrom,
} from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import { financingContracts, managedDevices, mdmCommands } from "../database/schema.js";
import { EsperMdmProvider } from "../providers/esper.provider.js";
import type { EnrollManagedDeviceDto, IssueMdmCommandDto } from "./devices.dto.js";

const publicManagedDeviceColumns = {
  id: managedDevices.id,
  tenantId: managedDevices.tenantId,
  contractId: managedDevices.contractId,
  provider: managedDevices.provider,
  providerDeviceId: managedDevices.providerDeviceId,
  inventoryUnitId: managedDevices.inventoryUnitId,
  imei: managedDevices.imei,
  serialNumber: managedDevices.serialNumber,
  status: managedDevices.status,
  lastSeenAt: managedDevices.lastSeenAt,
  enrolledAt: managedDevices.enrolledAt,
  releasedAt: managedDevices.releasedAt,
  deviceOwnerAttested: managedDevices.deviceOwnerAttested,
  createdAt: managedDevices.createdAt,
  updatedAt: managedDevices.updatedAt,
};

@Injectable()
export class DevicesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly esper: EsperMdmProvider,
  ) {}

  list(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    const permission = context.permissions.has("devices.read")
      ? "devices.read"
      : "self.devices.read";
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      (transaction) =>
        transaction
          .select(publicManagedDeviceColumns)
          .from(managedDevices)
          .where(eq(managedDevices.tenantId, tenantId))
          .orderBy(desc(managedDevices.createdAt)),
    );
  }

  get(context: AuthorizationContext, deviceId: string) {
    const tenantId = tenantIdFrom(context);
    const permission = context.permissions.has("devices.read")
      ? "devices.read"
      : "self.devices.read";
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const [device] = await transaction
          .select(publicManagedDeviceColumns)
          .from(managedDevices)
          .where(
            and(eq(managedDevices.tenantId, tenantId), eq(managedDevices.id, deviceId)),
          )
          .limit(1);
        if (device === undefined) {
          throw new NotFoundException("Managed device not found.");
        }
        const commands = await transaction
          .select()
          .from(mdmCommands)
          .where(
            and(
              eq(mdmCommands.tenantId, tenantId),
              eq(mdmCommands.managedDeviceId, deviceId),
            ),
          )
          .orderBy(desc(mdmCommands.createdAt));
        return { ...device, commands };
      },
    );
  }

  async enroll(context: AuthorizationContext, input: EnrollManagedDeviceDto) {
    const tenantId = tenantIdFrom(context);
    const providerState = await this.esper.getDevice(input.providerDeviceId);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["devices.manage"],
      async (transaction) => {
        const [contract] = await transaction
          .select()
          .from(financingContracts)
          .where(
            and(
              eq(financingContracts.tenantId, tenantId),
              eq(financingContracts.id, input.contractId),
            ),
          )
          .limit(1);
        if (contract === undefined) {
          throw new BadRequestException("Contract not found.");
        }
        if (!["active", "past_due", "suspended"].includes(contract.status)) {
          throw new ConflictException("Only an active servicing contract can enroll.");
        }
        if (contract.device.imei !== input.imei) {
          throw new BadRequestException("IMEI does not match the signed contract.");
        }
        const [device] = await transaction
          .insert(managedDevices)
          .values({
            tenantId,
            contractId: input.contractId,
            provider: "esper",
            providerDeviceId: input.providerDeviceId,
            imei: input.imei,
            status: "active",
            enrolledAt: new Date().toISOString(),
            providerState,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "device.enrolled",
          "managed_device",
          device?.id,
          {
            contractId: input.contractId,
            provider: "esper",
            providerDeviceId: input.providerDeviceId,
          },
        );
        return device;
      },
    );
  }

  async issueCommand(
    context: AuthorizationContext,
    deviceId: string,
    idempotencyKey: string,
    input: IssueMdmCommandDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const commandId = randomUUID();
    const prepared = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["devices.manage"],
      async (transaction) => {
        const claim = await claimIdempotencyKey(
          transaction,
          tenantId,
          "devices.command",
          idempotencyKey,
          { deviceId, ...input },
          "mdm_command",
          commandId,
        );
        if (claim.replay) {
          const [existing] = await transaction
            .select({ command: mdmCommands, device: managedDevices })
            .from(mdmCommands)
            .innerJoin(
              managedDevices,
              and(
                eq(managedDevices.tenantId, mdmCommands.tenantId),
                eq(managedDevices.id, mdmCommands.managedDeviceId),
              ),
            )
            .where(
              and(
                eq(mdmCommands.tenantId, tenantId),
                eq(mdmCommands.id, claim.resourceId),
              ),
            )
            .limit(1);
          if (existing === undefined) {
            throw new ConflictException("Idempotent MDM command is missing.");
          }
          return { ...existing, dispatch: false };
        }
        const [device] = await transaction
          .select()
          .from(managedDevices)
          .where(
            and(eq(managedDevices.tenantId, tenantId), eq(managedDevices.id, deviceId)),
          )
          .for("update")
          .limit(1);
        if (device === undefined) {
          throw new NotFoundException("Managed device not found.");
        }
        if (["released", "wiped"].includes(device.status) && input.kind !== "sync") {
          throw new ConflictException(
            "Released or wiped devices cannot be controlled.",
          );
        }
        const [command] = await transaction
          .insert(mdmCommands)
          .values({
            id: commandId,
            tenantId,
            managedDeviceId: device.id,
            kind: input.kind,
            idempotencyKey,
            reason: input.reason,
            requestedBy: context.user.id,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "device.command_requested",
          "mdm_command",
          commandId,
          { deviceId, kind: input.kind, reason: input.reason },
        );
        return { command: command!, device, dispatch: true };
      },
    );
    if (!prepared.dispatch) {
      return prepared.command;
    }
    if (prepared.device.provider === "first_party_dpc") {
      return this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["devices.manage"],
        async (transaction) => {
          const nextStatus =
            input.kind === "restrict" || input.kind === "lock"
              ? "restricted"
              : input.kind === "release"
                ? "active"
                : prepared.device.status;
          await transaction
            .update(managedDevices)
            .set({ status: nextStatus })
            .where(
              and(
                eq(managedDevices.tenantId, tenantId),
                eq(managedDevices.id, prepared.device.id),
              ),
            );
          await recordAudit(
            transaction,
            context,
            "device.command_queued",
            "mdm_command",
            prepared.command.id,
            { deviceId, kind: input.kind },
          );
          return prepared.command;
        },
      );
    }

    try {
      const provider = await this.esper.issueCommand(
        prepared.device.providerDeviceId,
        input.kind,
        input.reason,
      );
      return this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["devices.manage"],
        async (transaction) => {
          const now = new Date().toISOString();
          const [command] = await transaction
            .update(mdmCommands)
            .set({
              status: "sent",
              providerCommandId: provider.commandId,
              sentAt: now,
            })
            .where(
              and(
                eq(mdmCommands.tenantId, tenantId),
                eq(mdmCommands.id, prepared.command.id),
                eq(mdmCommands.status, "queued"),
              ),
            )
            .returning();
          if (command === undefined) {
            throw new ConflictException("MDM command changed concurrently.");
          }
          const nextDeviceStatus =
            input.kind === "restrict"
              ? "restricted"
              : input.kind === "release"
                ? "active"
                : input.kind === "wipe"
                  ? "wiped"
                  : prepared.device.status;
          await transaction
            .update(managedDevices)
            .set({
              status: nextDeviceStatus,
              providerState: provider.providerResponse,
              releasedAt: input.kind === "release" ? now : undefined,
            })
            .where(
              and(
                eq(managedDevices.tenantId, tenantId),
                eq(managedDevices.id, prepared.device.id),
              ),
            );
          await recordAudit(
            transaction,
            context,
            "device.command_sent",
            "mdm_command",
            command.id,
            { providerCommandId: provider.commandId, kind: input.kind },
          );
          return command;
        },
      );
    } catch (error) {
      await this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["devices.manage"],
        async (transaction) => {
          const failureReason =
            error instanceof Error ? error.message.slice(0, 500) : "Provider error";
          await transaction
            .update(mdmCommands)
            .set({ status: "failed", failureReason })
            .where(
              and(
                eq(mdmCommands.tenantId, tenantId),
                eq(mdmCommands.id, prepared.command.id),
                eq(mdmCommands.status, "queued"),
              ),
            );
          await recordAudit(
            transaction,
            context,
            "device.command_failed",
            "mdm_command",
            prepared.command.id,
            { kind: input.kind, failureReason },
          );
        },
      );
      throw error;
    }
  }
}
