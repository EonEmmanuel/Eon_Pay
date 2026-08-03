import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";

export type EsperCommandKind = "lock" | "restrict" | "release" | "sync" | "wipe";

@Injectable()
export class EsperMdmProvider {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get configured(): boolean {
    return (
      this.config.get("ESPER_TENANT_NAME", { infer: true }) !== undefined &&
      this.config.get("ESPER_API_KEY", { infer: true }) !== undefined
    );
  }

  async issueCommand(
    providerDeviceId: string,
    kind: EsperCommandKind,
    reason: string,
  ): Promise<{ commandId: string; providerResponse: Record<string, unknown> }> {
    const tenantName = this.config.get("ESPER_TENANT_NAME", { infer: true });
    const apiKey = this.config.get("ESPER_API_KEY", { infer: true });
    if (tenantName === undefined || apiKey === undefined) {
      throw new ServiceUnavailableException("Esper MDM is not configured.");
    }
    const command = this.toEsperCommand(kind, reason);
    const response = await fetch(
      `https://${tenantName}-api.esper.cloud/api/commands/v0/commands/`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          command_type: "DEVICE",
          devices: [providerDeviceId],
          device_type: "all",
          ...command,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Esper command failed with status ${response.status}.`,
      );
    }
    const value = (await response.json()) as Record<string, unknown>;
    const commandId =
      typeof value["id"] === "string"
        ? value["id"]
        : typeof value["command_id"] === "string"
          ? value["command_id"]
          : undefined;
    if (commandId === undefined) {
      throw new ServiceUnavailableException("Esper returned an invalid response.");
    }
    return { commandId, providerResponse: value };
  }

  async getDevice(providerDeviceId: string): Promise<Record<string, unknown>> {
    const tenantName = this.config.get("ESPER_TENANT_NAME", { infer: true });
    const apiKey = this.config.get("ESPER_API_KEY", { infer: true });
    if (tenantName === undefined || apiKey === undefined) {
      throw new ServiceUnavailableException("Esper MDM is not configured.");
    }
    const response = await fetch(
      `https://${tenantName}-api.esper.cloud/api/device/v0/devices/${encodeURIComponent(providerDeviceId)}/`,
      {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Esper device lookup failed with status ${response.status}.`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private toEsperCommand(
    kind: EsperCommandKind,
    reason: string,
  ): { command: string; command_args?: Record<string, unknown> } {
    switch (kind) {
      case "lock":
        return { command: "LOCK" };
      case "restrict":
        return {
          command: "SET_DEVICE_LOCKDOWN_STATE",
          command_args: { state: "LOCKED", message: reason },
        };
      case "release":
        return { command: "CONVERGE" };
      case "sync":
        return { command: "UPDATE_HEARTBEAT" };
      case "wipe":
        return { command: "WIPE" };
    }
  }
}
