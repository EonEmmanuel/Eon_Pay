import { createHash } from "node:crypto";
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleAuth } from "google-auth-library";
import type { Environment } from "../config/environment.js";

interface IntegrityResponse {
  tokenPayloadExternal?: {
    requestDetails?: {
      requestPackageName?: string;
      requestHash?: string;
      timestampMillis?: string;
    };
    appIntegrity?: {
      appRecognitionVerdict?: string;
      packageName?: string;
    };
    deviceIntegrity?: {
      deviceRecognitionVerdict?: string[];
    };
  };
}

@Injectable()
export class PlayIntegrityService {
  private readonly enabled: boolean;
  private readonly packageName: string;
  private readonly auth?: GoogleAuth;

  constructor(config: ConfigService<Environment, true>) {
    this.enabled = config.get("PLAY_INTEGRITY_ENABLED", { infer: true });
    this.packageName = config.get("DPC_ANDROID_PACKAGE_NAME", { infer: true });
    const encoded = config.get("PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64", {
      infer: true,
    });
    if (!this.enabled || encoded === undefined) return;
    this.auth = new GoogleAuth({
      credentials: decodeGoogleCredentials(encoded),
      scopes: ["https://www.googleapis.com/auth/playintegrity"],
    });
  }

  async verify(
    deviceId: string,
    credential: string,
    integrityToken: string | undefined,
  ): Promise<void> {
    if (!this.enabled) return;
    if (integrityToken === undefined || this.auth === undefined) {
      throw new UnauthorizedException("Device integrity evidence is required.");
    }

    let decoded: IntegrityResponse;
    try {
      const client = await this.auth.getClient();
      const response = await client.request<IntegrityResponse>({
        method: "POST",
        url: `https://playintegrity.googleapis.com/v1/${this.packageName}:decodeIntegrityToken`,
        data: { integrity_token: integrityToken },
      });
      decoded = response.data;
    } catch {
      throw new ServiceUnavailableException(
        "Device integrity verification is temporarily unavailable.",
      );
    }

    const payload = decoded.tokenPayloadExternal;
    const request = payload?.requestDetails;
    const appIntegrity = payload?.appIntegrity;
    const deviceVerdicts = payload?.deviceIntegrity?.deviceRecognitionVerdict ?? [];
    const expectedHash = createHash("sha256")
      .update(`${deviceId}|${credential}`, "utf8")
      .digest("base64url");
    const timestamp = Number(request?.timestampMillis);
    const ageMillis = Date.now() - timestamp;
    const valid =
      request?.requestPackageName === this.packageName &&
      request.requestHash === expectedHash &&
      Number.isFinite(timestamp) &&
      ageMillis >= -60_000 &&
      ageMillis <= 5 * 60_000 &&
      appIntegrity?.appRecognitionVerdict === "PLAY_RECOGNIZED" &&
      appIntegrity.packageName === this.packageName &&
      deviceVerdicts.includes("MEETS_DEVICE_INTEGRITY");
    if (!valid) {
      throw new UnauthorizedException("Device integrity verification failed.");
    }
  }
}

function decodeGoogleCredentials(encoded: string): Record<string, string> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64 is not valid Base64 JSON.");
  }
  if (value === null || typeof value !== "object") {
    throw new Error("The Play Integrity service account must be a JSON object.");
  }
  const candidate = value as Record<string, unknown>;
  const clientEmail = stringValue(candidate["client_email"]);
  const privateKey = stringValue(candidate["private_key"]);
  const projectId = stringValue(candidate["project_id"]);
  if (
    clientEmail === undefined ||
    privateKey === undefined ||
    projectId === undefined
  ) {
    throw new Error("The Play Integrity service account is missing credentials.");
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: projectId,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
