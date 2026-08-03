import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import type { Environment } from "../config/environment.js";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service.js";
import {
  financingContracts,
  inventoryUnits,
  managedDevices,
} from "../database/schema.js";
import type {
  AgentCheckInDto,
  AgentCommandAcknowledgementDto,
  AgentEnrollDto,
  CreateDeviceEnrollmentDto,
} from "./device-enrollment.dto.js";
import {
  DevicePolicySigner,
  type DevicePolicyPayload,
} from "./device-policy-signer.service.js";

@Injectable()
export class DeviceEnrollmentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<Environment, true>,
    private readonly policySigner: DevicePolicySigner,
  ) {}

  createIntent(context: AuthorizationContext, input: CreateDeviceEnrollmentDto) {
    this.assertProvisioningConfigured();
    const tenantId = tenantIdFrom(context);
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashCredential(rawToken);
    const expiresAt = new Date(
      Date.now() +
        this.config.get("DPC_ENROLLMENT_TTL_MINUTES", { infer: true }) * 60_000,
    ).toISOString();

    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["devices.manage", "inventory.stock.manage"],
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
          .for("update")
          .limit(1);
        if (contract === undefined) throw new NotFoundException("Contract not found.");
        const isPreActivation = contract.status === "pending_signature";
        const isLegacyActiveContract = ["active", "past_due", "suspended"].includes(
          contract.status,
        );
        if (!isPreActivation && !isLegacyActiveContract) {
          throw new ConflictException(
            "Device enrollment is available before activation or as a controlled retrofit for an active financed contract.",
          );
        }

        const [unit] = await transaction
          .select()
          .from(inventoryUnits)
          .where(
            and(
              eq(inventoryUnits.tenantId, tenantId),
              eq(inventoryUnits.id, input.inventoryUnitId),
              eq(inventoryUnits.branchId, contract.branchId),
            ),
          )
          .for("update")
          .limit(1);
        if (
          unit === undefined ||
          unit.catalogProductId !== contract.device.deviceId ||
          !(isPreActivation
            ? unit.status === "available" ||
              (unit.status === "reserved" &&
                unit.reservedApplicationId === contract.sourceApplicationId)
            : unit.status === "financed" && unit.contractId === contract.id)
        ) {
          throw new ConflictException(
            isPreActivation
              ? "Select an available stock unit for this contract product and branch."
              : "Select the financed stock unit already assigned to this contract.",
          );
        }

        const [existing] = await transaction
          .select()
          .from(managedDevices)
          .where(
            and(
              eq(managedDevices.tenantId, tenantId),
              eq(managedDevices.contractId, contract.id),
            ),
          )
          .for("update")
          .limit(1);
        if (existing !== undefined && existing.status !== "pending_enrollment") {
          throw new ConflictException("This contract already has an enrolled device.");
        }
        if (
          existing?.inventoryUnitId !== null &&
          existing?.inventoryUnitId !== undefined &&
          existing.inventoryUnitId !== unit.id
        ) {
          throw new ConflictException(
            "This contract already reserved another unit for enrollment.",
          );
        }

        if (isPreActivation && unit.status === "available") {
          const reserved = await transaction
            .update(inventoryUnits)
            .set({
              status: "reserved",
              reservedApplicationId: contract.sourceApplicationId,
              version: sql`${inventoryUnits.version} + 1`,
            })
            .where(
              and(
                eq(inventoryUnits.tenantId, tenantId),
                eq(inventoryUnits.id, unit.id),
                eq(inventoryUnits.status, "available"),
                eq(inventoryUnits.version, unit.version),
              ),
            )
            .returning({ id: inventoryUnits.id });
          if (reserved[0] === undefined) {
            throw new ConflictException(
              "The selected stock unit was reserved concurrently.",
            );
          }
        }

        const deviceId = existing?.id ?? randomUUID();
        const values = {
          inventoryUnitId: unit.id,
          imei: unit.imei,
          serialNumber: unit.serialNumber,
          enrollmentTokenHash: tokenHash,
          enrollmentExpiresAt: expiresAt,
          enrollmentConsumedAt: null,
          credentialHash: null,
          deviceOwnerAttested: false,
          policyVersion: 0,
          status: "pending_enrollment" as const,
          providerState: {},
        };
        const [device] =
          existing === undefined
            ? await transaction
                .insert(managedDevices)
                .values({
                  id: deviceId,
                  tenantId,
                  contractId: contract.id,
                  provider: "first_party_dpc",
                  providerDeviceId: deviceId,
                  ...values,
                })
                .returning()
            : await transaction
                .update(managedDevices)
                .set(values)
                .where(
                  and(
                    eq(managedDevices.tenantId, tenantId),
                    eq(managedDevices.id, existing.id),
                  ),
                )
                .returning();
        if (device === undefined) {
          throw new ConflictException("Device enrollment could not be prepared.");
        }
        await recordAudit(
          transaction,
          context,
          "device.enrollment_prepared",
          "managed_device",
          device.id,
          { contractId: contract.id, inventoryUnitId: unit.id, expiresAt },
        );

        return {
          device: publicEnrollmentState(device),
          enrollmentToken: rawToken,
          expiresAt,
          provisioningPayload: this.provisioningPayload(device.id, rawToken),
        };
      },
    );
  }

  status(context: AuthorizationContext, contractId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["devices.read"],
      async (transaction) => {
        const [device] = await transaction
          .select({
            id: managedDevices.id,
            contractId: managedDevices.contractId,
            inventoryUnitId: managedDevices.inventoryUnitId,
            imei: managedDevices.imei,
            serialNumber: managedDevices.serialNumber,
            status: managedDevices.status,
            enrolledAt: managedDevices.enrolledAt,
            lastSeenAt: managedDevices.lastSeenAt,
            enrollmentExpiresAt: managedDevices.enrollmentExpiresAt,
            deviceOwnerAttested: managedDevices.deviceOwnerAttested,
            provider: managedDevices.provider,
          })
          .from(managedDevices)
          .where(
            and(
              eq(managedDevices.tenantId, tenantId),
              eq(managedDevices.contractId, contractId),
            ),
          )
          .limit(1);
        return device ?? null;
      },
    );
  }

  private provisioningPayload(deviceId: string, enrollmentToken: string) {
    return {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
        "com.eonpay.deviceagent/.admin.FinanceDeviceAdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
        this.config.get("DPC_APK_DOWNLOAD_URL", { infer: true }),
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": this.config.get(
        "DPC_APK_SIGNATURE_CHECKSUM",
        { infer: true },
      ),
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        deviceId,
        enrollmentCredential: enrollmentToken,
      },
    };
  }

  private assertProvisioningConfigured() {
    if (
      !this.policySigner.configured ||
      this.config.get("DPC_APK_DOWNLOAD_URL", { infer: true }) === undefined ||
      this.config.get("DPC_APK_SIGNATURE_CHECKSUM", { infer: true }) === undefined
    ) {
      throw new ServiceUnavailableException(
        "First-party device enrollment is not configured on this server.",
      );
    }
  }
}

function hashCredential(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function publicEnrollmentState(device: typeof managedDevices.$inferSelect) {
  return {
    id: device.id,
    contractId: device.contractId,
    inventoryUnitId: device.inventoryUnitId,
    imei: device.imei,
    serialNumber: device.serialNumber,
    status: device.status,
    enrollmentExpiresAt: device.enrollmentExpiresAt,
  };
}
