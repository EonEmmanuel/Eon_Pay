import { createHash } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { AuthorizationContext } from "./request-context.js";
import type { DatabaseTransaction } from "../database/database.service.js";
import { auditEvents, idempotencyRecords } from "../database/schema.js";

export function tenantIdFrom(context: AuthorizationContext): string {
  if (context.tenantId === undefined) {
    throw new Error("Tenant authorization context is required.");
  }
  return context.tenantId;
}

export async function recordAudit(
  transaction: DatabaseTransaction,
  context: AuthorizationContext,
  action: string,
  resourceType: string,
  resourceId?: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await transaction.insert(auditEvents).values({
    tenantId: context.tenantId,
    actorUserId: context.user.id,
    action,
    resourceType,
    resourceId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    details,
  });
}

export function hashIdempotentRequest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function claimIdempotencyKey(
  transaction: DatabaseTransaction,
  tenantId: string,
  operation: string,
  key: string,
  payload: unknown,
  resourceType: string,
  resourceId: string,
): Promise<{ replay: boolean; resourceId: string }> {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
    throw new ConflictException("Idempotency-Key must be 8-200 safe ASCII characters.");
  }

  const requestHash = hashIdempotentRequest(payload);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const inserted = await transaction
    .insert(idempotencyRecords)
    .values({
      tenantId,
      operation,
      key,
      requestHash,
      resourceType,
      resourceId,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning({ resourceId: idempotencyRecords.resourceId });

  if (inserted[0] !== undefined) {
    return { replay: false, resourceId };
  }

  const [existing] = await transaction
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.tenantId, tenantId),
        eq(idempotencyRecords.operation, operation),
        eq(idempotencyRecords.key, key),
      ),
    )
    .limit(1);

  if (
    existing === undefined ||
    existing.requestHash !== requestHash ||
    existing.resourceType !== resourceType ||
    existing.resourceId === null
  ) {
    throw new ConflictException(
      "Idempotency key was already used for a different request.",
    );
  }

  return { replay: true, resourceId: existing.resourceId };
}
