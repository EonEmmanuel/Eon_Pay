import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import type {
  AgentCheckInDto,
  AgentCommandAcknowledgementDto,
  AgentEnrollDto,
} from "./device-enrollment.dto.js";
import {
  DevicePolicySigner,
  type DevicePolicyPayload,
} from "./device-policy-signer.service.js";

interface DevicePolicyContextRow extends Record<string, unknown> {
  tenant_id: string;
  contract_id: string;
  device_status: string;
  contract_status: string;
  tenant_name: string;
  currency: string;
  policy_version: number | string;
  commands?: Array<{ id: string; kind: string; reason: string }>;
}

@Injectable()
export class DeviceAgentGatewayService {
  constructor(
    private readonly database: DatabaseService,
    private readonly policySigner: DevicePolicySigner,
  ) {}

  async enroll(deviceId: string, enrollmentToken: string, input: AgentEnrollDto) {
    if (!input.deviceOwner) {
      throw new ConflictException(
        "The agent must be provisioned as Android Device Owner.",
      );
    }
    const tokenHash = hashCredential(enrollmentToken);
    const rawCredential = randomBytes(32).toString("base64url");
    const credentialHash = hashCredential(rawCredential);
    try {
      return await this.database.withDeviceTransaction(
        deviceId,
        tokenHash,
        async (transaction) => {
          const result = await transaction.execute<DevicePolicyContextRow>(sql`
            select *
            from public.app_enroll_first_party_device(
              ${deviceId}::uuid,
              ${tokenHash},
              ${credentialHash},
              ${input.deviceOwner},
              ${JSON.stringify({
                appVersion: input.appVersion,
                integrityTokenPresent: Boolean(input.integrityToken),
                enrollmentProtocol: 1,
              })}::jsonb
            )
          `);
          const context = result.rows[0];
          if (context === undefined)
            throw new UnauthorizedException("Enrollment was rejected.");
          return {
            deviceCredential: rawCredential,
            signedPolicyToken: this.signedPolicy(deviceId, context),
            commands: [],
          };
        },
      );
    } catch (error) {
      throw mapDeviceAuthenticationError(
        error,
        "Enrollment credential is invalid or expired.",
      );
    }
  }

  async checkIn(deviceId: string, credential: string, input: AgentCheckInDto) {
    const credentialHash = hashCredential(credential);
    try {
      return await this.database.withDeviceTransaction(
        deviceId,
        credentialHash,
        async (transaction) => {
          const result = await transaction.execute<DevicePolicyContextRow>(sql`
            select *
            from public.app_check_in_first_party_device(
              ${deviceId}::uuid,
              ${credentialHash},
              ${JSON.stringify({
                appVersion: input.appVersion,
                connectivityState: input.connectivityState,
                fcmToken: input.fcmToken,
                iccid: input.iccid,
                imsi: input.imsi,
                simChanged: input.simChanged,
                integrityTokenPresent: Boolean(input.integrityToken),
                lastCheckInAt: new Date().toISOString(),
              })}::jsonb
            )
          `);
          const context = result.rows[0];
          if (context === undefined)
            throw new UnauthorizedException("Check-in was rejected.");
          return {
            signedPolicyToken: this.signedPolicy(deviceId, context),
            commands: context.commands ?? [],
          };
        },
      );
    } catch (error) {
      throw mapDeviceAuthenticationError(error, "Device credential is invalid.");
    }
  }

  async acknowledge(
    deviceId: string,
    commandId: string,
    credential: string,
    input: AgentCommandAcknowledgementDto,
  ) {
    const credentialHash = hashCredential(credential);
    try {
      return await this.database.withDeviceTransaction(
        deviceId,
        credentialHash,
        async (transaction) => {
          const result = await transaction.execute<{ acknowledged: boolean }>(sql`
            select public.app_acknowledge_first_party_command(
              ${deviceId}::uuid,
              ${commandId}::uuid,
              ${credentialHash},
              ${input.success},
              ${input.failureReason ?? null}
            ) as acknowledged
          `);
          if (result.rows[0]?.acknowledged !== true) {
            throw new NotFoundException("Pending device command not found.");
          }
          return { id: commandId, status: input.success ? "acknowledged" : "failed" };
        },
      );
    } catch (error) {
      throw mapDeviceAuthenticationError(error, "Device credential is invalid.");
    }
  }

  private signedPolicy(deviceId: string, context: DevicePolicyContextRow): string {
    const now = new Date();
    const payload: DevicePolicyPayload = {
      deviceId,
      tenantId: context.tenant_id,
      policyTier: policyTier(context.device_status, context.contract_status),
      amountDue: "0",
      daysOverdue: context.contract_status === "past_due" ? 1 : 0,
      brandingConfig: {
        brandName: context.tenant_name,
        brandColor: "#2457C5",
        languageTag: "en",
        currencyCode: context.currency,
      },
      issuedAt: now.toISOString(),
      expiresAt: this.policySigner.policyExpiresAt(now),
      policyVersion: Number(context.policy_version),
    };
    return this.policySigner.sign(payload);
  }
}

function hashCredential(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function policyTier(
  deviceStatus: string,
  contractStatus: string,
): DevicePolicyPayload["policyTier"] {
  if (deviceStatus === "restricted") return "soft_lock";
  if (contractStatus === "past_due") return "warning";
  if (["terminated", "written_off"].includes(contractStatus)) return "hard_lock";
  return "active";
}

function mapDeviceAuthenticationError(error: unknown, message: string): unknown {
  if (error instanceof ConflictException || error instanceof NotFoundException)
    return error;
  if (hasDatabaseCode(error, "28000")) return new UnauthorizedException(message);
  return error;
}

function hasDatabaseCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 4 && current !== null && typeof current === "object";
    depth += 1
  ) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
