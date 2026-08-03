import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  AuthenticatedUser,
  AuthorizationContext,
} from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service.js";
import {
  branches,
  ledgerAccounts,
  platformInvitations,
  roles,
  tenantInvitationBranches,
  tenantInvitations,
  tenants,
} from "../database/schema.js";
import {
  InvitationDeliveryError,
  SupabaseInvitationsProvider,
} from "../providers/supabase-invitations.provider.js";
import type { CreateTenantDto, InviteMembershipDto } from "../tenants/tenants.dto.js";

const tenantOwnerRoleId = "00000000-0000-4000-8000-000000000101";
const invitationLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1_000;
const defaultLedgerAccounts = [
  ["CASH", "Cash", "asset"],
  ["MOBILE_MONEY_CLEARING", "Mobile money clearing", "asset"],
  ["BANK_CLEARING", "Bank transfer clearing", "asset"],
  ["CARD_CLEARING", "Card clearing", "asset"],
  ["DOWN_PAYMENT_RECEIVABLE", "Down payment receivable", "asset"],
  ["PRINCIPAL_RECEIVABLE", "Principal receivable", "asset"],
  ["FINANCE_CHARGE_RECEIVABLE", "Finance charge receivable", "asset"],
  ["FEE_RECEIVABLE", "Fee receivable", "asset"],
  ["FEE_INCOME", "Fee income", "income"],
  ["UNAPPLIED_CREDIT", "Unapplied customer credit", "liability"],
] as const;

interface InvitePlatformUserInput {
  email: string;
  fullName: string;
  roleId: string;
}

interface AcceptanceMetadata {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}
export interface TenantInvitationSummary {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  allBranches: boolean;
  status: "pending" | "accepted" | "expired" | "revoked";
  deliveryStatus: "pending" | "sent" | "failed";
  deliveryError: string | null;
  requiresPasswordSetup: boolean;
  sentAt: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  branches: Array<{ id: string; code: string; name: string; active: boolean }>;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly delivery: SupabaseInvitationsProvider,
  ) {}

  async provisionTenant(context: AuthorizationContext, input: CreateTenantDto) {
    const normalizedEmail = normalizeEmail(input.ownerEmail);
    const expiresAt = invitationExpiry();
    const provisioned = await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.tenants.create", "platform.users.invite"],
      async (transaction) => {
        const profileExists = await transaction.execute<{ exists: boolean }>(sql`
          select public.app_user_profile_exists_by_email(${normalizedEmail}) as exists
        `);
        const [tenant] = await transaction
          .insert(tenants)
          .values({
            slug: input.slug,
            name: input.name,
            active: false,
            onboardingStatus: "pending_owner",
          })
          .onConflictDoNothing({ target: tenants.slug })
          .returning();
        if (tenant === undefined) {
          throw new ConflictException("A retailer with this slug already exists.");
        }

        await transaction.insert(branches).values({
          tenantId: tenant.id,
          code: input.branchCode,
          name: input.branchName,
        });
        await transaction.insert(ledgerAccounts).values(
          defaultLedgerAccounts.map(([code, name, type]) => ({
            tenantId: tenant.id,
            code,
            name,
            type,
          })),
        );
        const [invitation] = await transaction
          .insert(tenantInvitations)
          .values({
            tenantId: tenant.id,
            email: input.ownerEmail.trim(),
            normalizedEmail,
            fullName: input.ownerName.trim(),
            roleId: tenantOwnerRoleId,
            allBranches: true,
            requiresPasswordSetup: profileExists.rows[0]?.exists !== true,
            expiresAt,
            invitedBy: context.user.id,
          })
          .returning();
        if (invitation === undefined) {
          throw new ConflictException("Owner invitation could not be created.");
        }
        await recordAudit(
          transaction,
          context,
          "platform.tenant.created",
          "tenant",
          tenant.id,
          { ownerEmail: normalizedEmail, invitationId: invitation.id },
        );
        return { tenant, invitation };
      },
    );

    const ownerInvitation = await this.deliverPlatformInvitation(
      context,
      provisioned.invitation,
    );
    return { ...provisioned.tenant, ownerInvitation };
  }

  listPlatformTenants(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.tenants.read"],
      async (transaction) => {
        const tenantRows = await transaction
          .select()
          .from(tenants)
          .orderBy(asc(tenants.name));
        const invitationRows = await transaction
          .select()
          .from(tenantInvitations)
          .where(eq(tenantInvitations.roleId, tenantOwnerRoleId))
          .orderBy(desc(tenantInvitations.createdAt));
        const latestInvitationByTenant = new Map<
          string,
          typeof tenantInvitations.$inferSelect
        >();
        for (const invitation of invitationRows) {
          if (!latestInvitationByTenant.has(invitation.tenantId)) {
            latestInvitationByTenant.set(invitation.tenantId, invitation);
          }
        }
        return tenantRows.map((tenant) => {
          const invitation = latestInvitationByTenant.get(tenant.id);
          return {
            ...tenant,
            ...(invitation === undefined
              ? {}
              : { ownerInvitation: invitationSummary(invitation) }),
          };
        });
      },
    );
  }

  async resendPlatformOwnerInvitation(context: AuthorizationContext, tenantId: string) {
    const invitation = await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.tenants.create", "platform.users.invite"],
      async (transaction) => {
        const [pending] = await transaction
          .select()
          .from(tenantInvitations)
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              eq(tenantInvitations.roleId, tenantOwnerRoleId),
              eq(tenantInvitations.status, "pending"),
            ),
          )
          .orderBy(desc(tenantInvitations.createdAt))
          .limit(1);
        if (pending === undefined) {
          throw new NotFoundException(
            "No pending owner invitation exists for this retailer.",
          );
        }
        let refreshed: typeof tenantInvitations.$inferSelect | undefined;
        if (new Date(pending.expiresAt).getTime() <= Date.now()) {
          await transaction
            .update(tenantInvitations)
            .set({ status: "expired" })
            .where(eq(tenantInvitations.id, pending.id));
          [refreshed] = await transaction
            .insert(tenantInvitations)
            .values({
              tenantId: pending.tenantId,
              email: pending.email,
              normalizedEmail: pending.normalizedEmail,
              fullName: pending.fullName,
              roleId: pending.roleId,
              allBranches: pending.allBranches,
              requiresPasswordSetup: pending.requiresPasswordSetup,
              expiresAt: invitationExpiry(),
              invitedBy: context.user.id,
            })
            .returning();
        } else {
          [refreshed] = await transaction
            .update(tenantInvitations)
            .set({
              deliveryStatus: "pending",
              deliveryError: null,
            })
            .where(eq(tenantInvitations.id, pending.id))
            .returning();
        }
        if (refreshed === undefined) {
          throw new NotFoundException("The owner invitation no longer exists.");
        }
        await recordAudit(
          transaction,
          context,
          "platform.tenant.owner_invitation.resend_requested",
          "tenant_invitation",
          refreshed.id,
          { tenantId },
        );
        return refreshed;
      },
    );
    return this.deliverPlatformInvitation(context, invitation);
  }

  async invitePlatformUser(
    context: AuthorizationContext,
    input: InvitePlatformUserInput,
  ) {
    const normalizedEmail = normalizeEmail(input.email);
    const invitation = await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.invite"],
      async (transaction) => {
        const [role] = await transaction
          .select({ id: roles.id, key: roles.key })
          .from(roles)
          .where(
            and(
              eq(roles.id, input.roleId),
              eq(roles.scope, "platform"),
              isNull(roles.tenantId),
            ),
          )
          .limit(1);
        if (role === undefined) {
          throw new NotFoundException("Platform role not found.");
        }
        if (
          role.key === "platform_owner" &&
          !context.permissions.has("platform.owners.manage")
        ) {
          throw new ConflictException(
            "Platform owner authority is required to invite another owner.",
          );
        }
        const profileExists = await transaction.execute<{ exists: boolean }>(sql`
          select public.app_user_profile_exists_by_email(${normalizedEmail}) as exists
        `);
        const [created] = await transaction
          .insert(platformInvitations)
          .values({
            email: input.email.trim(),
            normalizedEmail,
            fullName: input.fullName.trim(),
            roleId: role.id,
            requiresPasswordSetup: profileExists.rows[0]?.exists !== true,
            expiresAt: invitationExpiry(),
            invitedBy: context.user.id,
          })
          .onConflictDoNothing()
          .returning();
        if (created === undefined) {
          throw new ConflictException(
            "A pending platform invitation already exists for this email and role.",
          );
        }
        await recordAudit(
          transaction,
          context,
          "platform.invitation.created",
          "platform_invitation",
          created.id,
          { email: normalizedEmail, roleId: role.id },
        );
        return created;
      },
    );
    return this.deliverPlatformStaffInvitation(context, invitation);
  }

  listPlatformInvitations(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.read"],
      (transaction) =>
        transaction
          .select({
            id: platformInvitations.id,
            email: platformInvitations.email,
            fullName: platformInvitations.fullName,
            roleId: platformInvitations.roleId,
            roleKey: roles.key,
            roleName: roles.name,
            status: platformInvitations.status,
            deliveryStatus: platformInvitations.deliveryStatus,
            deliveryError: platformInvitations.deliveryError,
            requiresPasswordSetup: platformInvitations.requiresPasswordSetup,
            sentAt: platformInvitations.sentAt,
            expiresAt: platformInvitations.expiresAt,
            acceptedAt: platformInvitations.acceptedAt,
            createdAt: platformInvitations.createdAt,
          })
          .from(platformInvitations)
          .innerJoin(roles, eq(roles.id, platformInvitations.roleId))
          .orderBy(desc(platformInvitations.createdAt)),
    );
  }

  async resendPlatformInvitation(context: AuthorizationContext, invitationId: string) {
    const invitation = await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.invite"],
      async (transaction) => {
        const [pending] = await transaction
          .select()
          .from(platformInvitations)
          .where(
            and(
              eq(platformInvitations.id, invitationId),
              eq(platformInvitations.status, "pending"),
            ),
          )
          .limit(1);
        if (pending === undefined) {
          throw new NotFoundException("Pending platform invitation not found.");
        }
        let refreshed: typeof platformInvitations.$inferSelect | undefined;
        if (new Date(pending.expiresAt).getTime() <= Date.now()) {
          await transaction
            .update(platformInvitations)
            .set({ status: "expired" })
            .where(eq(platformInvitations.id, pending.id));
          [refreshed] = await transaction
            .insert(platformInvitations)
            .values({
              email: pending.email,
              normalizedEmail: pending.normalizedEmail,
              fullName: pending.fullName,
              roleId: pending.roleId,
              requiresPasswordSetup: pending.requiresPasswordSetup,
              expiresAt: invitationExpiry(),
              invitedBy: context.user.id,
            })
            .returning();
        } else {
          [refreshed] = await transaction
            .update(platformInvitations)
            .set({ deliveryStatus: "pending", deliveryError: null })
            .where(eq(platformInvitations.id, pending.id))
            .returning();
        }
        if (refreshed === undefined) {
          throw new NotFoundException("Platform invitation no longer exists.");
        }
        await recordAudit(
          transaction,
          context,
          "platform.invitation.resend_requested",
          "platform_invitation",
          refreshed.id,
        );
        return refreshed;
      },
    );
    return this.deliverPlatformStaffInvitation(context, invitation);
  }

  revokePlatformInvitation(context: AuthorizationContext, invitationId: string) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.invite"],
      async (transaction) => {
        const [revoked] = await transaction
          .update(platformInvitations)
          .set({ status: "revoked" })
          .where(
            and(
              eq(platformInvitations.id, invitationId),
              eq(platformInvitations.status, "pending"),
            ),
          )
          .returning();
        if (revoked === undefined) {
          throw new NotFoundException("Pending platform invitation not found.");
        }
        await recordAudit(
          transaction,
          context,
          "platform.invitation.revoked",
          "platform_invitation",
          invitationId,
          { email: revoked.normalizedEmail, roleId: revoked.roleId },
        );
        return platformInvitationSummary(revoked);
      },
    );
  }
  async inviteTenantMember(context: AuthorizationContext, input: InviteMembershipDto) {
    const tenantId = tenantIdFrom(context);
    const normalizedEmail = normalizeEmail(input.email);
    const invitation = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.manage"],
      async (transaction) => {
        const [role] = await transaction
          .select({ id: roles.id, key: roles.key })
          .from(roles)
          .where(
            and(
              eq(roles.id, input.roleId),
              eq(roles.scope, "tenant"),
              or(isNull(roles.tenantId), eq(roles.tenantId, tenantId)),
            ),
          )
          .limit(1);
        if (role === undefined || role.key === "customer") {
          throw new NotFoundException("Assignable tenant role not found.");
        }
        if (
          role.key === "tenant_owner" &&
          !context.permissions.has("tenant.owners.manage")
        ) {
          throw new ForbiddenException(
            "Retailer owner authority is required to invite another owner.",
          );
        }
        validateStaffAccessScope(role.key, input.allBranches, input.branchIds);
        await assertInvitationBranches(transaction, tenantId, input.branchIds);

        const profileExists = await transaction.execute<{ exists: boolean }>(sql`
          select public.app_user_profile_exists_by_email(${normalizedEmail}) as exists
        `);
        const [created] = await transaction
          .insert(tenantInvitations)
          .values({
            tenantId,
            email: input.email.trim(),
            normalizedEmail,
            fullName: input.fullName.trim(),
            roleId: role.id,
            allBranches: input.allBranches,
            requiresPasswordSetup: profileExists.rows[0]?.exists !== true,
            expiresAt: invitationExpiry(),
            invitedBy: context.user.id,
          })
          .onConflictDoNothing()
          .returning();
        if (created === undefined) {
          throw new ConflictException(
            "A pending invitation already exists for this email and role.",
          );
        }
        if (!input.allBranches) {
          await transaction.insert(tenantInvitationBranches).values(
            input.branchIds.map((branchId) => ({
              tenantId,
              invitationId: created.id,
              branchId,
            })),
          );
        }
        await recordAudit(
          transaction,
          context,
          "membership.invited",
          "tenant_invitation",
          created.id,
          {
            email: normalizedEmail,
            roleId: role.id,
            allBranches: input.allBranches,
            branchIds: input.branchIds,
          },
        );
        return created;
      },
    );

    return this.deliverTenantInvitation(context, invitation);
  }

  listTenantInvitations(
    context: AuthorizationContext,
  ): Promise<TenantInvitationSummary[]> {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.read"],
      async (transaction) => {
        const invitationRows = await transaction
          .select({
            id: tenantInvitations.id,
            email: tenantInvitations.email,
            fullName: tenantInvitations.fullName,
            roleId: tenantInvitations.roleId,
            roleKey: roles.key,
            roleName: roles.name,
            allBranches: tenantInvitations.allBranches,
            status: tenantInvitations.status,
            deliveryStatus: tenantInvitations.deliveryStatus,
            deliveryError: tenantInvitations.deliveryError,
            requiresPasswordSetup: tenantInvitations.requiresPasswordSetup,
            sentAt: tenantInvitations.sentAt,
            expiresAt: tenantInvitations.expiresAt,
            acceptedAt: tenantInvitations.acceptedAt,
            createdAt: tenantInvitations.createdAt,
          })
          .from(tenantInvitations)
          .innerJoin(roles, eq(roles.id, tenantInvitations.roleId))
          .where(eq(tenantInvitations.tenantId, tenantId))
          .orderBy(desc(tenantInvitations.createdAt));
        const branchRows = await transaction
          .select({
            invitationId: tenantInvitationBranches.invitationId,
            id: branches.id,
            code: branches.code,
            name: branches.name,
            active: branches.active,
          })
          .from(tenantInvitationBranches)
          .innerJoin(
            branches,
            and(
              eq(branches.tenantId, tenantInvitationBranches.tenantId),
              eq(branches.id, tenantInvitationBranches.branchId),
            ),
          )
          .where(eq(tenantInvitationBranches.tenantId, tenantId))
          .orderBy(asc(branches.name));

        return invitationRows.map((invitation) => ({
          ...invitation,
          branches: branchRows
            .filter((branch) => branch.invitationId === invitation.id)
            .map(({ invitationId: _invitationId, ...branch }) => branch),
        }));
      },
    );
  }

  async resendTenantInvitation(context: AuthorizationContext, invitationId: string) {
    const tenantId = tenantIdFrom(context);
    const invitation = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.manage"],
      async (transaction) => {
        const [pending] = await transaction
          .select({ invitation: tenantInvitations, roleKey: roles.key })
          .from(tenantInvitations)
          .innerJoin(roles, eq(roles.id, tenantInvitations.roleId))
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              eq(tenantInvitations.id, invitationId),
              eq(tenantInvitations.status, "pending"),
            ),
          )
          .limit(1);
        if (pending === undefined) {
          throw new NotFoundException("Pending retailer invitation not found.");
        }
        if (
          pending.roleKey === "tenant_owner" &&
          !context.permissions.has("tenant.owners.manage")
        ) {
          throw new ForbiddenException(
            "Retailer owner authority is required to resend an owner invitation.",
          );
        }

        let refreshed: typeof tenantInvitations.$inferSelect | undefined;
        if (new Date(pending.invitation.expiresAt).getTime() <= Date.now()) {
          const branchRows = await transaction
            .select({ branchId: tenantInvitationBranches.branchId })
            .from(tenantInvitationBranches)
            .where(
              and(
                eq(tenantInvitationBranches.tenantId, tenantId),
                eq(tenantInvitationBranches.invitationId, pending.invitation.id),
              ),
            );
          await transaction
            .update(tenantInvitations)
            .set({ status: "expired" })
            .where(eq(tenantInvitations.id, pending.invitation.id));
          [refreshed] = await transaction
            .insert(tenantInvitations)
            .values({
              tenantId,
              email: pending.invitation.email,
              normalizedEmail: pending.invitation.normalizedEmail,
              fullName: pending.invitation.fullName,
              roleId: pending.invitation.roleId,
              allBranches: pending.invitation.allBranches,
              requiresPasswordSetup: pending.invitation.requiresPasswordSetup,
              expiresAt: invitationExpiry(),
              invitedBy: context.user.id,
            })
            .returning();
          if (refreshed !== undefined && branchRows.length > 0) {
            await transaction.insert(tenantInvitationBranches).values(
              branchRows.map(({ branchId }) => ({
                tenantId,
                invitationId: refreshed!.id,
                branchId,
              })),
            );
          }
        } else {
          [refreshed] = await transaction
            .update(tenantInvitations)
            .set({ deliveryStatus: "pending", deliveryError: null })
            .where(eq(tenantInvitations.id, pending.invitation.id))
            .returning();
        }
        if (refreshed === undefined) {
          throw new NotFoundException("Retailer invitation no longer exists.");
        }
        await recordAudit(
          transaction,
          context,
          "membership.invitation.resend_requested",
          "tenant_invitation",
          refreshed.id,
        );
        return refreshed;
      },
    );
    return this.deliverTenantInvitation(context, invitation);
  }

  revokeTenantInvitation(context: AuthorizationContext, invitationId: string) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.manage"],
      async (transaction) => {
        const [pending] = await transaction
          .select({ invitation: tenantInvitations, roleKey: roles.key })
          .from(tenantInvitations)
          .innerJoin(roles, eq(roles.id, tenantInvitations.roleId))
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              eq(tenantInvitations.id, invitationId),
              eq(tenantInvitations.status, "pending"),
            ),
          )
          .limit(1);
        if (pending === undefined) {
          throw new NotFoundException("Pending retailer invitation not found.");
        }
        if (
          pending.roleKey === "tenant_owner" &&
          !context.permissions.has("tenant.owners.manage")
        ) {
          throw new ForbiddenException(
            "Retailer owner authority is required to revoke an owner invitation.",
          );
        }
        const [revoked] = await transaction
          .update(tenantInvitations)
          .set({ status: "revoked" })
          .where(eq(tenantInvitations.id, pending.invitation.id))
          .returning();
        if (revoked === undefined) {
          throw new NotFoundException("Retailer invitation no longer exists.");
        }
        await recordAudit(
          transaction,
          context,
          "membership.invitation.revoked",
          "tenant_invitation",
          invitationId,
          { email: revoked.normalizedEmail, roleId: revoked.roleId },
        );
        return invitationSummary(revoked);
      },
    );
  }
  listForUser(user: AuthenticatedUser) {
    const email = user.email;
    if (email === undefined) {
      return Promise.resolve([]);
    }
    return this.database.withIdentityTransaction(user.id, (transaction) =>
      transaction
        .select({
          id: tenantInvitations.id,
          tenantId: tenantInvitations.tenantId,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          email: tenantInvitations.email,
          fullName: tenantInvitations.fullName,
          roleId: tenantInvitations.roleId,
          roleName: roles.name,
          requiresPasswordSetup: tenantInvitations.requiresPasswordSetup,
          expiresAt: tenantInvitations.expiresAt,
        })
        .from(tenantInvitations)
        .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
        .innerJoin(roles, eq(roles.id, tenantInvitations.roleId))
        .where(
          and(
            eq(tenantInvitations.normalizedEmail, normalizeEmail(email)),
            eq(tenantInvitations.status, "pending"),
            gt(tenantInvitations.expiresAt, new Date().toISOString()),
          ),
        )
        .orderBy(asc(tenantInvitations.createdAt)),
    );
  }

  listPlatformForUser(user: AuthenticatedUser) {
    const email = user.email;
    if (email === undefined) {
      return Promise.resolve([]);
    }
    return this.database.withIdentityTransaction(user.id, (transaction) =>
      transaction
        .select({
          id: platformInvitations.id,
          email: platformInvitations.email,
          fullName: platformInvitations.fullName,
          roleId: platformInvitations.roleId,
          roleName: roles.name,
          requiresPasswordSetup: platformInvitations.requiresPasswordSetup,
          expiresAt: platformInvitations.expiresAt,
        })
        .from(platformInvitations)
        .innerJoin(roles, eq(roles.id, platformInvitations.roleId))
        .where(
          and(
            eq(platformInvitations.normalizedEmail, normalizeEmail(email)),
            eq(platformInvitations.status, "pending"),
            gt(platformInvitations.expiresAt, new Date().toISOString()),
          ),
        )
        .orderBy(asc(platformInvitations.createdAt)),
    );
  }

  async acceptPlatform(
    user: AuthenticatedUser,
    invitationId: string,
    metadata: AcceptanceMetadata,
  ) {
    if (user.email === undefined) {
      throw new ConflictException("The authenticated account has no email address.");
    }

    try {
      return await this.database.withIdentityTransaction(
        user.id,
        async (transaction) => {
          const result = await transaction.execute<{
            user_id: string;
            role_id: string;
          }>(sql`
            select user_id, role_id
            from public.app_accept_platform_invitation(
              ${invitationId}::uuid,
              ${metadata.requestId ?? null},
              ${metadata.ipAddress ?? null},
              ${metadata.userAgent ?? null}
            )
          `);
          const accepted = result.rows[0];
          if (accepted === undefined) {
            throw new ConflictException("Invitation acceptance returned no result.");
          }
          return { userId: accepted.user_id, roleId: accepted.role_id };
        },
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ConflictException(
        "The platform invitation is invalid, expired, already used, or belongs to another account.",
      );
    }
  }
  async accept(
    user: AuthenticatedUser,
    invitationId: string,
    metadata: AcceptanceMetadata,
  ) {
    if (user.email === undefined) {
      throw new ConflictException("The authenticated account has no email address.");
    }

    try {
      return await this.database.withIdentityTransaction(
        user.id,
        async (transaction) => {
          const result = await transaction.execute<{
            tenant_id: string;
            membership_id: string;
          }>(sql`
          select tenant_id, membership_id
          from public.app_accept_tenant_invitation(
            ${invitationId}::uuid,
            ${metadata.requestId ?? null},
            ${metadata.ipAddress ?? null},
            ${metadata.userAgent ?? null}
          )
        `);
          const accepted = result.rows[0];
          if (accepted === undefined) {
            throw new ConflictException("Invitation acceptance returned no result.");
          }
          return {
            tenantId: accepted.tenant_id,
            membershipId: accepted.membership_id,
          };
        },
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ConflictException(
        "The invitation is invalid, expired, already used, or belongs to another account.",
      );
    }
  }

  private async deliverPlatformInvitation(
    context: AuthorizationContext,
    invitation: typeof tenantInvitations.$inferSelect,
  ) {
    const delivery = await this.attemptDelivery(invitation);
    const [updated] = await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.tenants.create"],
      async (transaction) => {
        const rows = await transaction
          .update(tenantInvitations)
          .set(delivery)
          .where(eq(tenantInvitations.id, invitation.id))
          .returning();
        if (delivery.deliveryStatus === "failed") {
          await recordAudit(
            transaction,
            context,
            "platform.tenant.owner_invitation.delivery_failed",
            "tenant_invitation",
            invitation.id,
            { deliveryError: delivery.deliveryError },
          );
        }
        return rows;
      },
    );
    return invitationSummary(updated ?? invitation);
  }

  private async deliverPlatformStaffInvitation(
    context: AuthorizationContext,
    invitation: typeof platformInvitations.$inferSelect,
  ) {
    const delivery = await this.attemptDelivery(invitation);
    const [updated] = await this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.invite"],
      async (transaction) => {
        const rows = await transaction
          .update(platformInvitations)
          .set(delivery)
          .where(eq(platformInvitations.id, invitation.id))
          .returning();
        if (delivery.deliveryStatus === "failed") {
          await recordAudit(
            transaction,
            context,
            "platform.invitation.delivery_failed",
            "platform_invitation",
            invitation.id,
            { deliveryError: delivery.deliveryError },
          );
        }
        return rows;
      },
    );
    return platformInvitationSummary(updated ?? invitation);
  }
  private async deliverTenantInvitation(
    context: AuthorizationContext,
    invitation: typeof tenantInvitations.$inferSelect,
  ) {
    const tenantId = tenantIdFrom(context);
    const delivery = await this.attemptDelivery(invitation);
    const [updated] = await this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.manage"],
      async (transaction) => {
        const rows = await transaction
          .update(tenantInvitations)
          .set(delivery)
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              eq(tenantInvitations.id, invitation.id),
            ),
          )
          .returning();
        if (delivery.deliveryStatus === "failed") {
          await recordAudit(
            transaction,
            context,
            "membership.invitation.delivery_failed",
            "tenant_invitation",
            invitation.id,
            { deliveryError: delivery.deliveryError },
          );
        }
        return rows;
      },
    );
    return invitationSummary(updated ?? invitation);
  }

  private async attemptDelivery(invitation: {
    email: string;
    fullName: string;
  }): Promise<
    | {
        deliveryStatus: "sent";
        deliveryError: null;
        sentAt: string;
      }
    | {
        deliveryStatus: "failed";
        deliveryError: string;
      }
  > {
    try {
      await this.delivery.send({
        email: invitation.email,
        fullName: invitation.fullName,
      });
      return {
        deliveryStatus: "sent",
        deliveryError: null,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        deliveryStatus: "failed",
        deliveryError:
          error instanceof InvitationDeliveryError ? error.reason : "unexpected_error",
      };
    }
  }
}

export function validateStaffAccessScope(
  roleKey: string,
  allBranches: boolean,
  branchIds: readonly string[],
): void {
  if (allBranches && branchIds.length > 0) {
    throw new ConflictException(
      "Tenant-wide access cannot include individual branch assignments.",
    );
  }
  if (!allBranches && branchIds.length === 0) {
    throw new ConflictException(
      "Branch-restricted access requires at least one active branch.",
    );
  }
  if ((roleKey === "tenant_owner" || roleKey === "tenant_admin") && !allBranches) {
    throw new ConflictException(
      "Retailer owners and administrators require tenant-wide access.",
    );
  }
  if ((roleKey === "branch_manager" || roleKey === "cashier") && allBranches) {
    throw new ConflictException(
      "Branch managers and cashiers must be assigned to specific branches.",
    );
  }
}

async function assertInvitationBranches(
  transaction: DatabaseTransaction,
  tenantId: string,
  branchIds: readonly string[],
): Promise<void> {
  if (branchIds.length === 0) {
    return;
  }
  const accessibleBranches = await transaction
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.tenantId, tenantId),
        eq(branches.active, true),
        inArray(branches.id, [...branchIds]),
      ),
    );
  if (accessibleBranches.length !== new Set(branchIds).size) {
    throw new ConflictException(
      "Every staff assignment must reference an active retailer branch.",
    );
  }
}
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invitationExpiry(): string {
  return new Date(Date.now() + invitationLifetimeMilliseconds).toISOString();
}

function invitationSummary(invitation: typeof tenantInvitations.$inferSelect) {
  return {
    id: invitation.id,
    email: invitation.email,
    fullName: invitation.fullName,
    status: invitation.status,
    deliveryStatus: invitation.deliveryStatus,
    deliveryError: invitation.deliveryError,
    requiresPasswordSetup: invitation.requiresPasswordSetup,
    sentAt: invitation.sentAt,
    expiresAt: invitation.expiresAt,
  };
}

function platformInvitationSummary(
  invitation: typeof platformInvitations.$inferSelect,
) {
  return {
    id: invitation.id,
    email: invitation.email,
    fullName: invitation.fullName,
    roleId: invitation.roleId,
    status: invitation.status,
    deliveryStatus: invitation.deliveryStatus,
    deliveryError: invitation.deliveryError,
    requiresPasswordSetup: invitation.requiresPasswordSetup,
    sentAt: invitation.sentAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
  };
}
