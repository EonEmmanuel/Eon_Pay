import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import {
  auditEvents,
  financingApplications,
  kycVerificationSessions,
  paymentProviderEvents,
} from "../database/schema.js";
import { DiditProvider } from "../providers/didit.provider.js";
import type { StartKycSessionDto } from "./kyc.dto.js";

type KycSessionStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "approved"
  | "declined"
  | "abandoned"
  | "expired"
  | "failed";

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly didit: DiditProvider,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private get pollingFallbackEnabled(): boolean {
    return this.config.get("DIDIT_KYC_POLLING_FALLBACK_ENABLED", {
      infer: true,
    });
  }

  async start(
    context: AuthorizationContext,
    applicationId: string,
    input: StartKycSessionDto,
  ) {
    const tenantId = tenantIdFrom(context);
    const permission = context.permissions.has("kyc.manage")
      ? "kyc.manage"
      : "self.kyc.manage";
    const prepared = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const [application] = await transaction
          .select()
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);
        if (application === undefined) {
          throw new BadRequestException("Application not found.");
        }
        if (!["submitted", "kyc_review"].includes(application.status)) {
          throw new ConflictException(
            "KYC can only start for a submitted application.",
          );
        }
        const [existing] = await transaction
          .select()
          .from(kycVerificationSessions)
          .where(
            and(
              eq(kycVerificationSessions.tenantId, tenantId),
              eq(kycVerificationSessions.applicationId, applicationId),
              eq(kycVerificationSessions.provider, "didit"),
              inArray(kycVerificationSessions.status, [
                "not_started",
                "in_progress",
                "in_review",
              ]),
            ),
          )
          .orderBy(desc(kycVerificationSessions.createdAt))
          .limit(1);
        return { application, existing };
      },
    );
    if (prepared.existing?.verificationUrl) {
      return {
        session: prepared.existing,
        verificationUrl: prepared.existing.verificationUrl,
        pollingFallbackEnabled: this.pollingFallbackEnabled,
      };
    }
    const application = prepared.application;

    const providerSession = await this.didit.createSession({
      vendorData: application.id,
      phone: application.applicant.phone,
      language: input.language,
      metadata: { tenant_id: tenantId, application_id: application.id, session_kind: "kyc" },
      ...(input.callbackUrl === undefined
        ? {}
        : { callbackUrl: input.callbackUrl }),
      ...(application.applicant.email === undefined
        ? {}
        : { email: application.applicant.email }),
    });

    const session = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const [created] = await transaction
          .insert(kycVerificationSessions)
          .values({
            tenantId,
            applicationId,
            customerId: application.customerId,
            provider: "didit",
            providerSessionId: providerSession.sessionId,
            verificationUrl: providerSession.url,
            status: this.mapStatus(providerSession.status),
            createdBy: context.user.id,
          })
          .onConflictDoNothing()
          .returning();
        const [stored] =
          created === undefined
            ? await transaction
                .select()
                .from(kycVerificationSessions)
                .where(
                  and(
                    eq(kycVerificationSessions.provider, "didit"),
                    eq(
                      kycVerificationSessions.providerSessionId,
                      providerSession.sessionId,
                    ),
                  ),
                )
                .limit(1)
            : [created];
        if (stored === undefined) {
          throw new ConflictException("KYC session could not be persisted.");
        }
        await transaction
          .update(financingApplications)
          .set({
            status:
              application.status === "submitted" ? "kyc_review" : application.status,
            kycStatus: "pending",
            version: sql`${financingApplications.version} + 1`,
          })
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          );
        await recordAudit(
          transaction,
          context,
          "kyc.session_started",
          "kyc_verification_session",
          stored.id,
          {
            applicationId,
            provider: "didit",
            consentVersion: input.consentVersion,
            consentAccepted: input.consentAccepted,
          },
        );
        return stored;
      },
    );
    return {
      session,
      verificationUrl: providerSession.url,
      pollingFallbackEnabled: this.pollingFallbackEnabled,
    };
  }

  status(context: AuthorizationContext, applicationId: string) {
    const tenantId = tenantIdFrom(context);
    const permission = context.permissions.has("kyc.read")
      ? "kyc.read"
      : "self.kyc.manage";
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      [permission],
      async (transaction) => {
        const [application] = await transaction
          .select({
            status: financingApplications.status,
            kycStatus: financingApplications.kycStatus,
          })
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);
        if (application === undefined) {
          throw new NotFoundException("Application not found.");
        }
        const [session] = await transaction
          .select({
            id: kycVerificationSessions.id,
            status: kycVerificationSessions.status,
            verificationUrl: kycVerificationSessions.verificationUrl,
            updatedAt: kycVerificationSessions.updatedAt,
          })
          .from(kycVerificationSessions)
          .where(
            and(
              eq(kycVerificationSessions.tenantId, tenantId),
              eq(kycVerificationSessions.applicationId, applicationId),
              eq(kycVerificationSessions.provider, "didit"),
            ),
          )
          .orderBy(desc(kycVerificationSessions.createdAt))
          .limit(1);
        return {
          ...application,
          pollingFallbackEnabled: this.pollingFallbackEnabled,
          session: session ?? null,
        };
      },
    );
  }

  async sync(context: AuthorizationContext, applicationId: string) {
    if (!this.pollingFallbackEnabled) {
      throw new NotFoundException("The Didit KYC polling fallback is disabled.");
    }
    const tenantId = tenantIdFrom(context);
    const current = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["kyc.manage"],
      async (transaction) => {
        const [application] = await transaction
          .select()
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);
        const [session] = await transaction
          .select()
          .from(kycVerificationSessions)
          .where(
            and(
              eq(kycVerificationSessions.tenantId, tenantId),
              eq(kycVerificationSessions.applicationId, applicationId),
              eq(kycVerificationSessions.provider, "didit"),
            ),
          )
          .orderBy(desc(kycVerificationSessions.createdAt))
          .limit(1);
        if (application === undefined || session === undefined) {
          throw new ConflictException("Start a Didit KYC session before syncing.");
        }
        return { application, session };
      },
    );
    if (
      ["approved", "declined", "abandoned", "expired", "failed"].includes(
        current.session.status,
      )
    ) {
      return this.status(context, applicationId);
    }
    const decision = await this.didit.retrieveDecision(
      current.session.providerSessionId,
    );
    const providerStatus = stringValue(decision["status"]);
    if (providerStatus === undefined) {
      throw new ConflictException("Didit returned a decision without a status.");
    }
    const status = this.mapStatus(providerStatus);
    const outcome = kycApplicationOutcome(status);
    await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["kyc.manage"],
      async (transaction) => {
        await transaction
          .update(kycVerificationSessions)
          .set({
            status,
            decision,
            completedAt: outcome.terminal ? new Date().toISOString() : undefined,
          })
          .where(
            and(
              eq(kycVerificationSessions.tenantId, tenantId),
              eq(kycVerificationSessions.id, current.session.id),
            ),
          );
        const [app] = await transaction
          .select({ status: financingApplications.status })
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, applicationId),
            ),
          )
          .limit(1);

        if (app !== undefined) {
          const canAdvance =
            status === "approved" &&
            ["submitted", "kyc_review"].includes(app.status);

          await transaction
            .update(financingApplications)
            .set({
              kycStatus: outcome.kycStatus,
              status: canAdvance ? "credit_review" : undefined,
              version: sql`${financingApplications.version} + 1`,
            })
            .where(
              and(
                eq(financingApplications.tenantId, tenantId),
                eq(financingApplications.id, applicationId),
              ),
            );
          
          if (status === "approved" && !canAdvance) {
            this.logger.warn(
              `KYC sync updated kycStatus for application ${applicationId}, but it did not advance to credit_review because its current status is "${app.status}".`,
            );
          }
        }

        await recordAudit(
          transaction,
          context,
          "kyc.polling_fallback_synced",
          "kyc_verification_session",
          current.session.id,
          { applicationId, providerStatus, status },
        );
      },
    );
    return this.status(context, applicationId);
  }

  async handleDiditWebhook(
    payload: Record<string, unknown>,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    this.didit.verifyWebhook(payload, signature, timestamp);
    const data = payload["data"] !== null && typeof payload["data"] === "object" ? (payload["data"] as Record<string, unknown>) : {};
    const eventId = payload["event_id"] ?? data["event_id"];
    const sessionId = payload["session_id"] ?? data["session_id"];
    const webhookType = payload["webhook_type"] ?? data["webhook_type"];
    const providerStatus = payload["status"] ?? data["status"];
    if (
      typeof eventId !== "string" ||
      typeof sessionId !== "string" ||
      typeof webhookType !== "string" ||
      typeof providerStatus !== "string"
    ) {
      throw new BadRequestException("Didit webhook envelope is invalid.");
    }
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    return this.database.withProviderTransaction(
      "kyc",
      "didit",
      sessionId,
      async (transaction, tenantId) => {
        const inserted = await transaction
          .insert(paymentProviderEvents)
          .values({
            tenantId,
            provider: "didit",
            externalEventId: eventId,
            eventType: webhookType,
            payloadHash,
            payload,
            signatureValid: true,
          })
          .onConflictDoNothing()
          .returning({ id: paymentProviderEvents.id });
        if (inserted[0] === undefined) {
          return { accepted: true, replay: true };
        }
        const status = this.mapStatus(providerStatus);
        const terminalStatuses = [
          "approved",
          "declined",
          "abandoned",
          "expired",
          "failed",
        ];
        const terminal = terminalStatuses.includes(status);

        // Guard: look up current session and prevent status regression
        const [currentSession] = await transaction
          .select()
          .from(kycVerificationSessions)
          .where(
            and(
              eq(kycVerificationSessions.tenantId, tenantId),
              eq(kycVerificationSessions.providerSessionId, sessionId),
            ),
          )
          .limit(1);
        if (currentSession === undefined) {
          throw new ConflictException("Didit session disappeared during processing.");
        }
        if (terminalStatuses.includes(currentSession.status)) {
          // Session already reached a terminal state — skip update to prevent regression
          this.logger.warn(
            `Ignoring Didit webhook for session ${sessionId}: already in terminal state "${currentSession.status}".`,
          );
          const now = new Date().toISOString();
          await transaction
            .update(paymentProviderEvents)
            .set({
              status: "processed",
              processingAttempts: 1,
              processedAt: now,
            })
            .where(eq(paymentProviderEvents.id, inserted[0].id));
          return { accepted: true, replay: false, skipped: true };
        }

        const [session] = await transaction
          .update(kycVerificationSessions)
          .set({
            status,
            decision:
              payload["decision"] !== undefined
                ? (payload["decision"] as Record<string, unknown>)
                : undefined,
            completedAt: terminal ? new Date().toISOString() : undefined,
          })
          .where(
            and(
              eq(kycVerificationSessions.tenantId, tenantId),
              eq(kycVerificationSessions.providerSessionId, sessionId),
            ),
          )
          .returning();
        if (session === undefined) {
          throw new ConflictException("Didit session disappeared during processing.");
        }
        const kycStatus = kycApplicationOutcome(status).kycStatus;
        
        const [app] = await transaction
          .select({ status: financingApplications.status })
          .from(financingApplications)
          .where(
            and(
              eq(financingApplications.tenantId, tenantId),
              eq(financingApplications.id, session.applicationId),
            ),
          )
          .limit(1);

        if (app !== undefined) {
          const canAdvance =
            status === "approved" &&
            ["submitted", "kyc_review"].includes(app.status);

          await transaction
            .update(financingApplications)
            .set({
              kycStatus,
              status: canAdvance ? "credit_review" : undefined,
              version: sql`${financingApplications.version} + 1`,
            })
            .where(
              and(
                eq(financingApplications.tenantId, tenantId),
                eq(financingApplications.id, session.applicationId),
              ),
            );

          if (status === "approved" && !canAdvance) {
            this.logger.warn(
              `KYC webhook updated kycStatus for application ${session.applicationId}, but it did not advance to credit_review because its current status is "${app.status}".`,
            );
          }
        }
        const now = new Date().toISOString();
        await transaction
          .update(paymentProviderEvents)
          .set({
            status: "processed",
            processingAttempts: 1,
            processedAt: now,
          })
          .where(eq(paymentProviderEvents.id, inserted[0].id));
        await transaction.insert(auditEvents).values({
          tenantId,
          action: "kyc.webhook_processed",
          resourceType: "kyc_verification_session",
          resourceId: session.id,
          details: { eventId, webhookType, status },
        });
        return { accepted: true, replay: false };
      },
    );
  }

  private mapStatus(status: string): KycSessionStatus {
    const normalized = status.toLowerCase().replaceAll(" ", "_");
    switch (normalized) {
      case "not_started":
        return "not_started";
      case "in_progress":
      case "resubmitted":
      case "awaiting_user":
        return "in_progress";
      case "in_review":
        return "in_review";
      case "approved":
        return "approved";
      case "declined":
        return "declined";
      case "abandoned":
        return "abandoned";
      case "expired":
      case "kyc_expired":
        return "expired";
      default:
        return "failed";
    }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function kycApplicationOutcome(status: KycSessionStatus) {
  const terminal = ["approved", "declined", "abandoned", "expired", "failed"].includes(
    status,
  );
  const kycStatus =
    status === "approved"
      ? ("verified" as const)
      : status === "declined" || status === "failed"
        ? ("failed" as const)
        : status === "expired" || status === "abandoned"
          ? ("needs_correction" as const)
          : ("pending" as const);
  return { terminal, kycStatus };
}
