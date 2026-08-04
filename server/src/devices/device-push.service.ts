import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleAuth } from "google-auth-library";
import type { Environment } from "../config/environment.js";

interface DevicePushTarget {
  firebaseInstallationId?: string;
  fcmToken?: string;
}

interface FirebaseCredentials extends Record<string, string> {
  project_id: string;
  client_email: string;
  private_key: string;
}

@Injectable()
export class DevicePushService {
  private readonly logger = new Logger(DevicePushService.name);
  private readonly auth?: GoogleAuth;
  private readonly projectId?: string;

  constructor(config: ConfigService<Environment, true>) {
    const encoded = config.get("FIREBASE_SERVICE_ACCOUNT_BASE64", { infer: true });
    if (encoded === undefined) return;

    const credentials = decodeServiceAccount(encoded);
    this.projectId = credentials.project_id;
    this.auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
  }

  get configured(): boolean {
    return this.auth !== undefined;
  }

  async requestPolicyRefresh(
    providerState: Record<string, unknown>,
    reason: string,
  ): Promise<boolean> {
    if (this.auth === undefined || this.projectId === undefined) return false;
    const target = pushTarget(providerState);
    if (target === undefined) return false;

    const recipient =
      target.firebaseInstallationId !== undefined
        ? { fid: target.firebaseInstallationId }
        : { token: target.fcmToken! };
    try {
      const client = await this.auth.getClient();
      await client.request({
        method: "POST",
        url: `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        data: {
          message: {
            ...recipient,
            data: {
              action: "refresh_policy",
              reason: reason.slice(0, 100),
            },
            android: {
              priority: "HIGH",
              ttl: "60s",
            },
          },
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(`Device policy push failed: ${safeErrorMessage(error)}`);
      return false;
    }
  }
}

function pushTarget(
  providerState: Record<string, unknown>,
): DevicePushTarget | undefined {
  const firebaseInstallationId = nonEmptyString(
    providerState["firebaseInstallationId"],
  );
  if (firebaseInstallationId !== undefined) return { firebaseInstallationId };
  const fcmToken = nonEmptyString(providerState["fcmToken"]);
  return fcmToken === undefined ? undefined : { fcmToken };
}

function decodeServiceAccount(encoded: string): FirebaseCredentials {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid Base64 JSON.");
  }
  if (value === null || typeof value !== "object") {
    throw new Error("The Firebase service account must be a JSON object.");
  }
  const candidate = value as Record<string, unknown>;
  const projectId = nonEmptyString(candidate["project_id"]);
  const clientEmail = nonEmptyString(candidate["client_email"]);
  const privateKey = nonEmptyString(candidate["private_key"]);
  if (
    projectId === undefined ||
    clientEmail === undefined ||
    privateKey === undefined
  ) {
    throw new Error("The Firebase service account is missing required credentials.");
  }
  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 300)
    : "Unknown Firebase error";
}
