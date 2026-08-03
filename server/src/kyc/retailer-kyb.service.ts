import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import {
  auditEvents,
  paymentProviderEvents,
  tenantBusinessProfiles,
  tenantKybCases,
  tenants,
  userProfiles,
} from "../database/schema.js";
import { DiditProvider } from "../providers/didit.provider.js";
import type { ReviewRetailerKybDto, StartRetailerKybDto } from "./retailer-kyb.dto.js";

@Injectable()
export class RetailerKybService {
  constructor(
    private readonly database: DatabaseService,
    private readonly didit: DiditProvider,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  private get pollingFallbackEnabled(): boolean {
    return this.config.get("DIDIT_KYB_POLLING_FALLBACK_ENABLED", {
      infer: true,
    });
  }

  getTenantCase(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["tenant.manage"],
      async (transaction) => {
        const [tenant] = await transaction
          .select({ onboardingStatus: tenants.onboardingStatus })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        const [kybCase] = await transaction
          .select()
          .from(tenantKybCases)
          .where(eq(tenantKybCases.tenantId, tenantId))
          .limit(1);
        return {
          configured: this.didit.kybConfigured,
          pollingFallbackEnabled: this.pollingFallbackEnabled,
          onboardingStatus: tenant?.onboardingStatus ?? "kyb_required",
          case: kybCase ?? null,
        };
      },
    );
  }

  async syncTenantCase(context: AuthorizationContext) {
    this.assertPollingFallbackEnabled();
    const current = await this.getTenantCase(context);
    const kybCase = current.case;
    const sessionId = kybCase?.providerSessionId;
    if (kybCase === null || sessionId === null || sessionId === undefined) {
      throw new ConflictException("A Didit KYB session is required before syncing.");
    }
    if (["approved", "rejected"].includes(kybCase.status)) return current;

    const decision = await this.didit.retrieveDecision(sessionId);
    const providerStatus = stringValue(decision["status"]);
    if (providerStatus === undefined) {
      throw new ConflictException("Didit returned a decision without a status.");
    }
    if (
      providerStatus === kybCase.providerStatus &&
      JSON.stringify(decision) === JSON.stringify(kybCase.decision)
    ) {
      return current;
    }

    const tenantId = tenantIdFrom(context);
    const values = providerDecisionValues(decision, providerStatus);
    await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["tenant.manage"],
      async (transaction) => {
        const [updated] = await transaction
          .update(tenantKybCases)
          .set(values.case)
          .where(
            and(
              eq(tenantKybCases.tenantId, tenantId),
              eq(tenantKybCases.providerSessionId, sessionId),
            ),
          )
          .returning();
        if (updated === undefined) {
          throw new ConflictException("The KYB case changed while it was syncing.");
        }
        await transaction
          .update(tenants)
          .set({ onboardingStatus: values.onboardingStatus })
          .where(eq(tenants.id, tenantId));
        await recordAudit(
          transaction,
          context,
          "tenant.kyb.polling_fallback_synced",
          "tenant_kyb_case",
          updated.id,
          { providerStatus, status: values.case.status },
        );
      },
    );
    return this.getTenantCase(context);
  }

  async start(context: AuthorizationContext, input: StartRetailerKybDto) {
    const tenantId = tenantIdFrom(context);
    const data = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["tenant.manage"],
      async (transaction) => {
        const [tenant] = await transaction
          .select({ id: tenants.id, onboardingStatus: tenants.onboardingStatus })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        const [profile] = await transaction
          .select()
          .from(tenantBusinessProfiles)
          .where(eq(tenantBusinessProfiles.tenantId, tenantId))
          .limit(1);
        const [existing] = await transaction
          .select()
          .from(tenantKybCases)
          .where(eq(tenantKybCases.tenantId, tenantId))
          .limit(1);
        if (tenant === undefined || profile === undefined) {
          throw new ConflictException(
            "Complete the retailer business profile before starting KYB.",
          );
        }
        if (!canStartRetailerKyb(tenant.onboardingStatus)) {
          throw new ConflictException("KYB is not available in the current state.");
        }
        if (
          existing?.verificationUrl !== null &&
          existing?.verificationUrl !== undefined &&
          ["in_progress", "in_review", "resubmission_required"].includes(
            existing.status,
          )
        ) {
          return { profile, existing };
        }
        return { profile, existing: undefined };
      },
    );

    if (data.existing !== undefined) {
      return { case: data.existing, verificationUrl: data.existing.verificationUrl };
    }
    const providerSession = await this.didit.createSession({
      kind: "kyb",
      vendorData: tenantId,
      email: data.profile.contactEmail,
      phone: data.profile.contactPhone,
      language: input.language,
      metadata: { tenant_id: tenantId, entity_type: "retailer" },
    });
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["tenant.manage"],
      async (transaction) => {
        const now = new Date().toISOString();
        const [kybCase] = await transaction
          .insert(tenantKybCases)
          .values({
            tenantId,
            providerSessionId: providerSession.sessionId,
            verificationUrl: providerSession.url,
            providerStatus: providerSession.status,
            status: "in_progress",
            submittedAt: now,
            createdBy: context.user.id,
          })
          .onConflictDoUpdate({
            target: tenantKybCases.tenantId,
            set: {
              providerSessionId: providerSession.sessionId,
              verificationUrl: providerSession.url,
              providerStatus: providerSession.status,
              status: "in_progress",
              submittedAt: now,
              decision: null,
              decisionReason: null,
              riskScore: null,
              reviewedAt: null,
              reviewedBy: null,
              reviewNotes: null,
              updatedAt: now,
            },
          })
          .returning();
        if (kybCase === undefined) {
          throw new ConflictException("The KYB session could not be saved.");
        }
        await transaction
          .update(tenants)
          .set({ onboardingStatus: "kyb_in_review", updatedAt: now })
          .where(eq(tenants.id, tenantId));
        await recordAudit(
          transaction,
          context,
          "tenant.kyb.started",
          "tenant_kyb_case",
          kybCase.id,
          {
            provider: "didit",
            providerSessionId: providerSession.sessionId,
            consentAccepted: input.consentAccepted,
            consentVersion: input.consentVersion,
          },
        );
        return { case: kybCase, verificationUrl: providerSession.url };
      },
    );
  }

  async handleWebhook(
    payload: Record<string, unknown>,
    signature: string | undefined,
    timestamp: string | undefined,
  ) {
    this.didit.verifyWebhook(payload, signature, timestamp);
    const envelope = webhookEnvelope(payload);
    const decision = await this.didit.retrieveDecision(envelope.sessionId);
    const providerStatus = stringValue(decision["status"]) ?? envelope.status;
    const status = mapProviderStatus(providerStatus);
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");

    return this.database.withProviderTransaction(
      "kyb",
      "didit",
      envelope.sessionId,
      async (transaction, tenantId) => {
        const [event] = await transaction
          .insert(paymentProviderEvents)
          .values({
            tenantId,
            provider: "didit-kyb",
            externalEventId: envelope.eventId,
            eventType: envelope.eventType,
            payloadHash,
            payload,
            signatureValid: true,
          })
          .onConflictDoNothing()
          .returning({ id: paymentProviderEvents.id });
        if (event === undefined) return { accepted: true, replay: true };

        const terminal = ["provider_approved", "provider_declined"].includes(status);
        const [kybCase] = await transaction
          .update(tenantKybCases)
          .set({
            status,
            providerStatus,
            decision,
            decisionReason:
              stringValue(decision["decision_reason_code"]) ??
              stringValue(decision["decision_reason"]),
            riskScore: numericRiskScore(decision),
            providerCompletedAt: terminal ? new Date().toISOString() : undefined,
          })
          .where(
            and(
              eq(tenantKybCases.tenantId, tenantId),
              eq(tenantKybCases.providerSessionId, envelope.sessionId),
            ),
          )
          .returning();
        if (kybCase === undefined) {
          throw new ConflictException("Didit KYB case disappeared during processing.");
        }
        await transaction
          .update(tenants)
          .set({
            onboardingStatus: terminal ? "pending_approval" : "kyb_in_review",
          })
          .where(eq(tenants.id, tenantId));
        await transaction
          .update(paymentProviderEvents)
          .set({
            status: "processed",
            processingAttempts: 1,
            processedAt: new Date().toISOString(),
          })
          .where(eq(paymentProviderEvents.id, event.id));
        await transaction.insert(auditEvents).values({
          tenantId,
          action: "tenant.kyb.webhook_processed",
          resourceType: "tenant_kyb_case",
          resourceId: kybCase.id,
          details: {
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            providerStatus,
            status,
          },
        });
        return { accepted: true, replay: false };
      },
    );
  }

  listPlatformCases(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.kyb.read"],
      (transaction) =>
        transaction
          .select({
            id: tenantKybCases.id,
            tenantId: tenants.id,
            tenantName: tenants.name,
            tenantSlug: tenants.slug,
            status: tenantKybCases.status,
            providerStatus: tenantKybCases.providerStatus,
            riskScore: tenantKybCases.riskScore,
            decisionReason: tenantKybCases.decisionReason,
            submittedAt: tenantKybCases.submittedAt,
            updatedAt: tenantKybCases.updatedAt,
            legalName: tenantBusinessProfiles.legalName,
            countryCode: tenantBusinessProfiles.countryCode,
            registrationNumber: tenantBusinessProfiles.registrationNumber,
          })
          .from(tenantKybCases)
          .innerJoin(tenants, eq(tenants.id, tenantKybCases.tenantId))
          .innerJoin(
            tenantBusinessProfiles,
            eq(tenantBusinessProfiles.tenantId, tenantKybCases.tenantId),
          )
          .orderBy(desc(tenantKybCases.updatedAt)),
    );
  }

  getPlatformCase(context: AuthorizationContext, caseId: string) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.kyb.read"],
      async (transaction) => {
        const [row] = await transaction
          .select({
            case: tenantKybCases,
            tenant: {
              id: tenants.id,
              name: tenants.name,
              slug: tenants.slug,
              onboardingStatus: tenants.onboardingStatus,
            },
            profile: tenantBusinessProfiles,
            reviewerName: userProfiles.displayName,
            reviewerEmail: userProfiles.email,
          })
          .from(tenantKybCases)
          .innerJoin(tenants, eq(tenants.id, tenantKybCases.tenantId))
          .innerJoin(
            tenantBusinessProfiles,
            eq(tenantBusinessProfiles.tenantId, tenantKybCases.tenantId),
          )
          .leftJoin(userProfiles, eq(userProfiles.id, tenantKybCases.reviewedBy))
          .where(eq(tenantKybCases.id, caseId))
          .limit(1);
        if (row === undefined) throw new NotFoundException("KYB case not found.");
        return {
          ...row,
          pollingFallbackEnabled: this.pollingFallbackEnabled,
        };
      },
    );
  }

  async syncPlatformCase(context: AuthorizationContext, caseId: string) {
    this.assertPollingFallbackEnabled();
    const current = await this.getPlatformCase(context, caseId);
    const sessionId = current.case.providerSessionId;
    if (sessionId === null) {
      throw new ConflictException("The KYB case has no Didit session.");
    }
    if (["approved", "rejected"].includes(current.case.status)) return current;

    const decision = await this.didit.retrieveDecision(sessionId);
    const providerStatus = stringValue(decision["status"]);
    if (providerStatus === undefined) {
      throw new ConflictException("Didit returned a decision without a status.");
    }
    if (
      providerStatus === current.case.providerStatus &&
      JSON.stringify(decision) === JSON.stringify(current.case.decision)
    ) {
      return current;
    }

    const values = providerDecisionValues(decision, providerStatus);
    await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.kyb.read", "platform.kyb.manage"],
      async (transaction) => {
        const [updated] = await transaction
          .update(tenantKybCases)
          .set(values.case)
          .where(
            and(
              eq(tenantKybCases.id, caseId),
              eq(tenantKybCases.providerSessionId, sessionId),
            ),
          )
          .returning();
        if (updated === undefined) {
          throw new ConflictException("The KYB case changed while it was syncing.");
        }
        await transaction
          .update(tenants)
          .set({ onboardingStatus: values.onboardingStatus })
          .where(eq(tenants.id, updated.tenantId));
        await recordAudit(
          transaction,
          context,
          "platform.kyb.polling_fallback_synced",
          "tenant_kyb_case",
          updated.id,
          {
            tenantId: updated.tenantId,
            providerStatus,
            status: values.case.status,
          },
        );
      },
    );
    return this.getPlatformCase(context, caseId);
  }

  async review(
    context: AuthorizationContext,
    caseId: string,
    input: ReviewRetailerKybDto,
  ) {
    const existing = await this.getPlatformCase(context, caseId);
    if (input.action === "request_resubmission") {
      const sessionId = existing.case.providerSessionId;
      if (sessionId === null) throw new ConflictException("Provider session missing.");
      await this.didit.requestResubmission(
        sessionId,
        input.notes,
        existing.profile.contactEmail,
      );
    }
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.kyb.manage"],
      async (transaction) => {
        const status =
          input.action === "approve"
            ? "approved"
            : input.action === "reject"
              ? "rejected"
              : "resubmission_required";
        if (
          input.action === "approve" &&
          existing.case.status !== "provider_approved"
        ) {
          throw new ConflictException(
            "Platform approval requires an approved Didit decision.",
          );
        }
        const now = new Date().toISOString();
        const [updated] = await transaction
          .update(tenantKybCases)
          .set({
            status,
            reviewedAt: now,
            reviewedBy: context.user.id,
            reviewNotes: input.notes.trim(),
          })
          .where(eq(tenantKybCases.id, caseId))
          .returning();
        if (updated === undefined) throw new NotFoundException("KYB case not found.");
        await transaction
          .update(tenants)
          .set({
            onboardingStatus:
              status === "approved"
                ? "active"
                : status === "rejected"
                  ? "rejected"
                  : "kyb_required",
          })
          .where(eq(tenants.id, updated.tenantId));
        await recordAudit(
          transaction,
          context,
          `platform.kyb.${input.action}`,
          "tenant_kyb_case",
          caseId,
          { tenantId: updated.tenantId, notes: input.notes.trim() },
        );
        return updated;
      },
    );
  }

  async report(context: AuthorizationContext, caseId: string) {
    const row = await this.getPlatformCase(context, caseId);
    if (row.case.providerSessionId === null) {
      throw new ConflictException("Provider report is not available.");
    }
    return this.didit.generateReport(row.case.providerSessionId);
  }

  private assertPollingFallbackEnabled(): void {
    if (!this.pollingFallbackEnabled) {
      throw new NotFoundException("The Didit polling fallback is disabled.");
    }
  }
}

function webhookEnvelope(payload: Record<string, unknown>) {
  const data =
    payload["data"] !== null && typeof payload["data"] === "object"
      ? (payload["data"] as Record<string, unknown>)
      : {};
  const eventId = stringValue(payload["event_id"]) ?? stringValue(payload["id"]);
  const sessionId =
    stringValue(payload["session_id"]) ?? stringValue(data["session_id"]);
  const eventType =
    stringValue(payload["webhook_type"]) ??
    stringValue(payload["event_type"]) ??
    stringValue(payload["type"]);
  const status =
    stringValue(payload["status"]) ?? stringValue(data["status"]) ?? "IN_REVIEW";
  if (eventId === undefined || sessionId === undefined || eventType === undefined) {
    throw new BadRequestException("Didit KYB webhook envelope is invalid.");
  }
  return { eventId, sessionId, eventType, status };
}

function mapProviderStatus(value: string) {
  const status = value.toUpperCase().replaceAll(" ", "_");
  if (status === "APPROVED") return "provider_approved" as const;
  if (status === "DECLINED") return "provider_declined" as const;
  if (status === "RESUBMITTED" || status === "RESUB_REQUESTED") {
    return "resubmission_required" as const;
  }
  if (status === "IN_REVIEW") return "in_review" as const;
  return "in_progress" as const;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numericRiskScore(decision: Record<string, unknown>): number | null {
  const value = decision["risk_score"];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function providerDecisionValues(
  decision: Record<string, unknown>,
  providerStatus: string,
) {
  const status = mapProviderStatus(providerStatus);
  const terminal = ["provider_approved", "provider_declined"].includes(status);
  return {
    case: {
      status,
      providerStatus,
      decision,
      decisionReason:
        stringValue(decision["decision_reason_code"]) ??
        stringValue(decision["decision_reason"]),
      riskScore: numericRiskScore(decision),
      providerCompletedAt: terminal ? new Date().toISOString() : undefined,
    },
    onboardingStatus: terminal
      ? ("pending_approval" as const)
      : ("kyb_in_review" as const),
  };
}

export function canStartRetailerKyb(status: string): boolean {
  return ["kyb_required", "kyb_in_review", "pending_approval", "active"].includes(
    status,
  );
}
