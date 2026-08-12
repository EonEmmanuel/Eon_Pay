import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";
import { verifyCanonicalHmacSha256, verifyTimestamp } from "./provider-security.js";

export interface DiditSessionRequest {
  vendorData: string;
  email?: string;
  phone?: string;
  language: "en" | "fr";
  metadata: Record<string, string>;
  kind?: "kyc" | "kyb";
}

export interface DiditSessionResponse {
  sessionId: string;
  url: string;
  status: string;
}

@Injectable()
export class DiditProvider {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get configured(): boolean {
    return (
      this.config.get("DIDIT_API_KEY", { infer: true }) !== undefined &&
      this.config.get("DIDIT_WORKFLOW_ID", { infer: true }) !== undefined
    );
  }

  get kybConfigured(): boolean {
    return (
      this.config.get("DIDIT_API_KEY", { infer: true }) !== undefined &&
      this.config.get("DIDIT_KYB_WORKFLOW_ID", { infer: true }) !== undefined &&
      this.config.get("DIDIT_WEBHOOK_SECRET", { infer: true }) !== undefined
    );
  }

  async createSession(input: DiditSessionRequest): Promise<DiditSessionResponse> {
    const apiKey = this.config.get("DIDIT_API_KEY", { infer: true });
    const workflowId = this.config.get(
      input.kind === "kyb" ? "DIDIT_KYB_WORKFLOW_ID" : "DIDIT_WORKFLOW_ID",
      { infer: true },
    );
    if (apiKey === undefined || workflowId === undefined) {
      throw new ServiceUnavailableException(
        `Didit ${input.kind === "kyb" ? "KYB" : "KYC"} is not configured.`,
      );
    }

    const response = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: input.vendorData,
        language: input.language,
        metadata: input.metadata,
        contact_details: {
          email: input.email,
          phone: input.phone,
          send_notification_emails: input.email !== undefined,
          email_lang: input.language,
        },
        ...this.callbackConfiguration(input.kind ?? "kyc"),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Didit session creation failed with status ${response.status}.`,
      );
    }
    const value = (await response.json()) as Record<string, unknown>;
    if (
      typeof value["session_id"] !== "string" ||
      typeof value["url"] !== "string" ||
      typeof value["status"] !== "string"
    ) {
      throw new ServiceUnavailableException("Didit returned an invalid response.");
    }
    return {
      sessionId: value["session_id"],
      url: value["url"],
      status: value["status"],
    };
  }

  async retrieveDecision(sessionId: string): Promise<Record<string, unknown>> {
    const response = await this.authorizedRequest(
      `https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/decision/`,
    );
    return (await response.json()) as Record<string, unknown>;
  }

  async generateReport(sessionId: string): Promise<{
    body: ArrayBuffer;
    contentType: string;
    fileName: string;
  }> {
    const response = await this.authorizedRequest(
      `https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/generate-pdf`,
    );
    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") ?? "application/pdf",
      fileName: `business_${sessionId}.pdf`,
    };
  }

  async requestResubmission(
    sessionId: string,
    comment: string,
    email?: string,
  ): Promise<void> {
    await this.authorizedRequest(
      `https://verification.didit.me/v3/session/${encodeURIComponent(sessionId)}/update-status/`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          new_status: "Resubmitted",
          comment,
          send_email: email !== undefined,
          ...(email === undefined
            ? {}
            : { email_address: email, email_language: "en" }),
        }),
      },
    );
  }

  verifyWebhook(
    payload: unknown,
    signature: string | undefined,
    timestamp: string | undefined,
  ): void {
    verifyTimestamp(timestamp);
    const secret = this.config.get("DIDIT_WEBHOOK_SECRET", { infer: true });
    if (secret === undefined) {
      throw new UnauthorizedException("Didit webhook is not configured.");
    }
    verifyCanonicalHmacSha256(payload, signature, secret);
  }

  private callbackConfiguration(
    kind: "kyc" | "kyb",
  ): { callback: string; callback_method: "POST" } | Record<string, never> {
    const callback = this.config.get(
      kind === "kyb" ? "DIDIT_KYB_CALLBACK_URL" : "DIDIT_CALLBACK_URL",
      { infer: true },
    );
    return callback === undefined ? {} : { callback, callback_method: "POST" };
  }

  private async authorizedRequest(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const apiKey = this.config.get("DIDIT_API_KEY", { infer: true });
    if (apiKey === undefined) {
      throw new ServiceUnavailableException("Didit is not configured.");
    }
    const response = await fetch(url, {
      ...init,
      headers: { "x-api-key": apiKey, ...init.headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Didit request failed with status ${response.status}.`,
      );
    }
    return response;
  }
}
