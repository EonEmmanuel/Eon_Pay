import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";

export interface DevicePolicyPayload {
  deviceId: string;
  tenantId: string;
  policyTier: "active" | "warning" | "soft_lock" | "hard_lock";
  amountDue: string;
  daysOverdue: number;
  brandingConfig: {
    brandName: string;
    brandColor: string;
    languageTag: string;
    currencyCode: string;
  };
  issuedAt: string;
  expiresAt: string;
  policyVersion: number;
  offlinePolicy: {
    enabled: boolean;
    gracePeriodSeconds: number;
    enforcementTier: "soft_lock";
  };
}

@Injectable()
export class DevicePolicySigner {
  private privateKey?: KeyObject;

  constructor(private readonly config: ConfigService<Environment, true>) {}

  get configured(): boolean {
    return (
      this.config.get("DPC_POLICY_PRIVATE_KEY_BASE64", { infer: true }) !== undefined
    );
  }

  sign(payload: DevicePolicyPayload): string {
    const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
    const signature = sign(null, payloadBytes, this.key());
    return `${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;
  }

  offlinePolicy(): DevicePolicyPayload["offlinePolicy"] {
    const graceHours = this.config.get("DPC_OFFLINE_GRACE_HOURS", { infer: true });
    return {
      enabled: true,
      gracePeriodSeconds: graceHours * 60 * 60,
      enforcementTier: "soft_lock",
    };
  }

  policyExpiresAt(now: Date): string {
    const ttlMinutes = this.config.get("DPC_POLICY_TTL_MINUTES", { infer: true });
    return new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
  }

  private key(): KeyObject {
    if (this.privateKey !== undefined) return this.privateKey;
    const encoded = this.config.get("DPC_POLICY_PRIVATE_KEY_BASE64", { infer: true });
    if (encoded === undefined) {
      throw new ServiceUnavailableException(
        "First-party device policy signing is not configured.",
      );
    }
    try {
      this.privateKey = createPrivateKey({
        key: Buffer.from(encoded, "base64"),
        format: "der",
        type: "pkcs8",
      });
      if (this.privateKey.asymmetricKeyType !== "ed25519") {
        throw new Error("The configured key is not Ed25519.");
      }
      return this.privateKey;
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? error.message
          : "The DPC policy signing key is invalid.",
      );
    }
  }
}
