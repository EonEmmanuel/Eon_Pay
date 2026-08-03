import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Environment } from "../config/environment.js";

export interface SendInvitationInput {
  email: string;
  fullName: string;
}

export type InvitationDeliveryFailureReason =
  "not_configured" | "provider_rejected" | "unexpected_error";

export class InvitationDeliveryError extends Error {
  constructor(
    readonly reason: InvitationDeliveryFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "InvitationDeliveryError";
  }
}

@Injectable()
export class SupabaseInvitationsProvider {
  private readonly logger = new Logger(SupabaseInvitationsProvider.name);
  private readonly client?: SupabaseClient;
  private readonly redirectUrl?: string;

  constructor(config: ConfigService<Environment, true>) {
    const publishableKey = config.get("SUPABASE_PUBLISHABLE_KEY", {
      infer: true,
    });
    this.redirectUrl = config.get("SUPABASE_INVITE_REDIRECT_URL", {
      infer: true,
    });

    if (publishableKey !== undefined && this.redirectUrl !== undefined) {
      this.client = createClient(
        config.get("SUPABASE_URL", { infer: true }),
        publishableKey,
        {
          auth: {
            flowType: "implicit",
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        },
      );
    }
  }

  get configured(): boolean {
    return this.client !== undefined && this.redirectUrl !== undefined;
  }

  async send(input: SendInvitationInput): Promise<void> {
    if (this.client === undefined || this.redirectUrl === undefined) {
      throw new InvitationDeliveryError(
        "not_configured",
        "Supabase email invitations are not configured.",
      );
    }

    const { error } = await this.client.auth.signInWithOtp({
      email: input.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: this.redirectUrl,
        data: { full_name: input.fullName },
      },
    });
    if (error !== null) {
      this.logger.warn(
        `Supabase invitation delivery failed: status=${error.status ?? "unknown"} code=${error.code ?? "unknown"} message=${error.message}`,
      );
      throw new InvitationDeliveryError(
        "provider_rejected",
        "Supabase could not deliver the invitation email.",
      );
    }
  }
}
