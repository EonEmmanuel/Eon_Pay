import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { tenantIdFrom } from "../common/persistence.js";
import { DatabaseService } from "../database/database.service.js";
import {
  auditEvents,
  journalEntries,
  journalLines,
  ledgerAccounts,
  userProfiles,
} from "../database/schema.js";
import { presentAuditEvent } from "./audit-presentation.js";

@Injectable()
export class LedgerService {
  constructor(private readonly database: DatabaseService) {}

  accounts(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["ledger.read"],
      (transaction) =>
        transaction
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.tenantId, tenantId))
          .orderBy(asc(ledgerAccounts.code)),
    );
  }

  entries(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["ledger.read"],
      (transaction) =>
        transaction
          .select()
          .from(journalEntries)
          .where(eq(journalEntries.tenantId, tenantId))
          .orderBy(desc(journalEntries.effectiveAt))
          .limit(100),
    );
  }

  entry(context: AuthorizationContext, entryId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["ledger.read"],
      async (transaction) => {
        const [entry] = await transaction
          .select()
          .from(journalEntries)
          .where(
            and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.id, entryId)),
          )
          .limit(1);
        if (entry === undefined) {
          throw new NotFoundException("Journal entry not found.");
        }
        const lines = await transaction
          .select()
          .from(journalLines)
          .where(
            and(
              eq(journalLines.tenantId, tenantId),
              eq(journalLines.journalEntryId, entry.id),
            ),
          );
        return { ...entry, lines };
      },
    );
  }

  audit(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["audit.read"],
      async (transaction) => {
        const rows = await transaction
          .select({
            event: auditEvents,
            actorName: userProfiles.displayName,
            actorEmail: userProfiles.email,
          })
          .from(auditEvents)
          .leftJoin(userProfiles, eq(userProfiles.id, auditEvents.actorUserId))
          .where(eq(auditEvents.tenantId, tenantId))
          .orderBy(desc(auditEvents.occurredAt))
          .limit(250);
        return rows.map((row) =>
          presentAuditEvent(row.event, {
            name: row.actorName,
            email: row.actorEmail,
          }),
        );
      },
    );
  }

  verifyAudit(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["audit.read"],
      async (transaction) => {
        const result = await transaction.execute<{
          valid: boolean;
          checked_events: string;
          first_invalid_event_id: string | null;
        }>(sql`select * from public.app_verify_audit_chain(${tenantId}::uuid)`);
        const value = result.rows[0];
        return {
          valid: value?.valid === true,
          checkedEvents: Number(value?.checked_events ?? 0),
          firstInvalidEventId: value?.first_invalid_event_id ?? null,
        };
      },
    );
  }

  platformAudit(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.audit.read"],
      async (transaction) => {
        const rows = await transaction
          .select({
            event: auditEvents,
            actorName: userProfiles.displayName,
            actorEmail: userProfiles.email,
          })
          .from(auditEvents)
          .leftJoin(userProfiles, eq(userProfiles.id, auditEvents.actorUserId))
          .where(isNull(auditEvents.tenantId))
          .orderBy(desc(auditEvents.occurredAt))
          .limit(500);
        return rows.map((row) =>
          presentAuditEvent(row.event, {
            name: row.actorName,
            email: row.actorEmail,
          }),
        );
      },
    );
  }

  verifyPlatformAudit(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.audit.read"],
      async (transaction) => {
        const result = await transaction.execute<{
          valid: boolean;
          checked_events: string;
          first_invalid_event_id: string | null;
        }>(sql`select * from public.app_verify_platform_audit_chain()`);
        const value = result.rows[0];
        return {
          valid: value?.valid === true,
          checkedEvents: Number(value?.checked_events ?? 0),
          firstInvalidEventId: value?.first_invalid_event_id ?? null,
        };
      },
    );
  }
}
