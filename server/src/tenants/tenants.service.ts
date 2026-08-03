import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { InvitationsService } from "../invitations/invitations.service.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit, tenantIdFrom } from "../common/persistence.js";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service.js";
import {
  branches,
  customers,
  rolePermissions,
  roles,
  tenantMemberRoles,
  tenantMembershipBranches,
  tenantMemberships,
  tenantInvitations,
  tenantBusinessProfiles,
  tenants,
  userProfiles,
} from "../database/schema.js";
import type {
  ArchiveTenantDto,
  AssignRoleDto,
  CreateBranchDto,
  CreateCustomerDto,
  CreateTenantDto,
  InviteMembershipDto,
  UpdateBranchDto,
  UpdateBusinessProfileDto,
  UpdateCustomerDto,
  UpdateMembershipAccessDto,
  UpdateMembershipDto,
} from "./tenants.dto.js";

export interface TenantMembershipSummary {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: "invited" | "active" | "suspended" | "revoked";
  allBranches: boolean;
  createdAt: string;
  isCurrentUser: boolean;
  roles: Array<{ id: string; key: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string; active: boolean }>;
}

export interface TenantRoleSummary {
  id: string;
  key: string;
  name: string;
  system: boolean;
  permissions: string[];
  accessPolicy: "tenant_wide" | "branch_required" | "flexible";
  requiresOwnerAuthority: boolean;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly invitations: InvitationsService,
  ) {}

  listPlatform(context: AuthorizationContext) {
    return this.invitations.listPlatformTenants(context);
  }

  createTenant(context: AuthorizationContext, input: CreateTenantDto) {
    return this.invitations.provisionTenant(context, input);
  }

  resendOwnerInvitation(context: AuthorizationContext, tenantId: string) {
    return this.invitations.resendPlatformOwnerInvitation(context, tenantId);
  }

  async archivePlatform(
    context: AuthorizationContext,
    tenantId: string,
    input: ArchiveTenantDto,
  ) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.tenants.manage"],
      async (transaction) => {
        const [tenant] = await transaction
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (tenant === undefined) {
          throw new NotFoundException("Retailer not found.");
        }
        if (tenant.archivedAt !== null) {
          return tenant;
        }

        const archivedAt = new Date().toISOString();
        const reason = input.reason.trim();
        const [archived] = await transaction
          .update(tenants)
          .set({
            active: false,
            archivedAt,
            archivedBy: context.user.id,
            archiveReason: reason,
          })
          .where(and(eq(tenants.id, tenantId), eq(tenants.active, tenant.active)))
          .returning();
        if (archived === undefined) {
          throw new NotFoundException("Retailer changed before it could be archived.");
        }

        await transaction
          .update(tenantInvitations)
          .set({ status: "revoked" })
          .where(
            and(
              eq(tenantInvitations.tenantId, tenantId),
              eq(tenantInvitations.status, "pending"),
            ),
          );
        await recordAudit(
          transaction,
          context,
          "platform.tenant.archived",
          "tenant",
          tenantId,
          { reason },
        );
        return archived;
      },
    );
  }

  getBusinessProfile(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["tenant.manage"],
      async (transaction) => {
        const [tenant] = await transaction
          .select({
            id: tenants.id,
            name: tenants.name,
            onboardingStatus: tenants.onboardingStatus,
          })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (tenant === undefined) {
          throw new NotFoundException("Retailer not found.");
        }
        const [profile] = await transaction
          .select()
          .from(tenantBusinessProfiles)
          .where(eq(tenantBusinessProfiles.tenantId, tenantId))
          .limit(1);
        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          onboardingStatus: tenant.onboardingStatus,
          profile: profile ?? null,
        };
      },
    );
  }

  async updateBusinessProfile(
    context: AuthorizationContext,
    input: UpdateBusinessProfileDto,
  ) {
    const tenantId = tenantIdFrom(context);
    try {
      return await this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["tenant.manage"],
        async (transaction) => {
          const [tenant] = await transaction
            .select({
              name: tenants.name,
              onboardingStatus: tenants.onboardingStatus,
            })
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);
          if (tenant === undefined) {
            throw new NotFoundException("Retailer not found.");
          }

          const cleanOptional = (value?: string) => {
            const normalized = value?.trim();
            return normalized === undefined || normalized.length === 0
              ? null
              : normalized;
          };
          const values = {
            legalName: input.legalName.trim(),
            tradingName: cleanOptional(input.tradingName),
            legalForm: input.legalForm,
            registrationNumber: input.registrationNumber.trim().toUpperCase(),
            taxIdentificationNumber: input.taxIdentificationNumber.trim().toUpperCase(),
            countryCode: input.countryCode.trim().toUpperCase(),
            registeredAddressLine1: input.registeredAddressLine1.trim(),
            registeredAddressLine2: cleanOptional(input.registeredAddressLine2),
            city: input.city.trim(),
            region: cleanOptional(input.region),
            postalCode: cleanOptional(input.postalCode),
            contactEmail: input.contactEmail.trim().toLowerCase(),
            contactPhone: input.contactPhone.trim(),
            websiteUrl: cleanOptional(input.websiteUrl),
            incorporationDate: cleanOptional(input.incorporationDate),
            baseCurrency: input.baseCurrency.trim().toUpperCase(),
            updatedBy: context.user.id,
            updatedAt: new Date().toISOString(),
          };
          const [profile] = await transaction
            .insert(tenantBusinessProfiles)
            .values({ tenantId, ...values })
            .onConflictDoUpdate({
              target: tenantBusinessProfiles.tenantId,
              set: values,
            })
            .returning();

          const onboardingStatus =
            tenant.onboardingStatus === "business_profile_required"
              ? "kyb_required"
              : tenant.onboardingStatus;
          if (onboardingStatus !== tenant.onboardingStatus) {
            await transaction
              .update(tenants)
              .set({ onboardingStatus, updatedAt: new Date().toISOString() })
              .where(eq(tenants.id, tenantId));
          }
          await recordAudit(
            transaction,
            context,
            "tenant.business_profile.updated",
            "tenant_business_profile",
            tenantId,
            { onboardingStatus },
          );
          return {
            tenantId,
            tenantName: tenant.name,
            onboardingStatus,
            profile: profile ?? null,
          };
        },
      );
    } catch (error) {
      mapTenantMutationError(error);
    }
  }

  listBranches(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["branches.read"],
      (transaction) =>
        transaction
          .select()
          .from(branches)
          .where(eq(branches.tenantId, tenantId))
          .orderBy(asc(branches.name)),
    );
  }

  createBranch(context: AuthorizationContext, input: CreateBranchDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["branches.manage"],
      async (transaction) => {
        try {
          const [branch] = await transaction
            .insert(branches)
            .values({
              tenantId,
              code: input.code.trim().toUpperCase(),
              name: input.name.trim(),
            })
            .returning();
          await recordAudit(
            transaction,
            context,
            "branch.created",
            "branch",
            branch?.id,
          );
          return branch;
        } catch (error) {
          mapTenantMutationError(error);
        }
      },
    );
  }

  updateBranch(
    context: AuthorizationContext,
    branchId: string,
    input: UpdateBranchDto,
  ) {
    const tenantId = tenantIdFrom(context);
    if (input.name === undefined && input.active === undefined) {
      throw new ConflictException("A branch name or active status is required.");
    }
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["branches.manage"],
      async (transaction) => {
        try {
          const [branch] = await transaction
            .update(branches)
            .set({
              ...(input.name === undefined ? {} : { name: input.name.trim() }),
              ...(input.active === undefined ? {} : { active: input.active }),
            })
            .where(and(eq(branches.tenantId, tenantId), eq(branches.id, branchId)))
            .returning();
          if (branch === undefined) {
            throw new NotFoundException("Branch not found.");
          }
          await recordAudit(
            transaction,
            context,
            "branch.updated",
            "branch",
            branch.id,
            { name: input.name, active: input.active },
          );
          return branch;
        } catch (error) {
          mapTenantMutationError(error);
        }
      },
    );
  }

  listCustomers(context: AuthorizationContext) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["customers.read"],
      (transaction) =>
        transaction
          .select()
          .from(customers)
          .where(eq(customers.tenantId, tenantId))
          .orderBy(asc(customers.fullName)),
    );
  }

  createCustomer(context: AuthorizationContext, input: CreateCustomerDto) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["customers.create"],
      async (transaction) => {
        await assertActiveBranch(transaction, tenantId, input.branchId);
        const [customer] = await transaction
          .insert(customers)
          .values({
            tenantId,
            branchId: input.branchId,
            fullName: input.fullName.trim(),
            phone: input.phone,
            email: input.email?.trim(),
            nationalIdReference: input.nationalIdReference?.trim(),
            userId: input.userId,
          })
          .returning();
        await recordAudit(
          transaction,
          context,
          "customer.created",
          "customer",
          customer?.id,
          { branchId: input.branchId },
        );
        return customer;
      },
    );
  }

  updateCustomer(
    context: AuthorizationContext,
    customerId: string,
    input: UpdateCustomerDto,
  ) {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["customers.update"],
      async (transaction) => {
        if (input.branchId !== undefined) {
          await assertActiveBranch(transaction, tenantId, input.branchId);
        }
        const [customer] = await transaction
          .update(customers)
          .set({
            ...input,
            fullName: input.fullName?.trim(),
            email: input.email?.trim(),
            nationalIdReference: input.nationalIdReference?.trim(),
            version: sql`${customers.version} + 1`,
          })
          .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
          .returning();
        if (customer === undefined) {
          throw new NotFoundException("Customer not found.");
        }
        await recordAudit(
          transaction,
          context,
          "customer.updated",
          "customer",
          customer.id,
          { branchId: input.branchId },
        );
        return customer;
      },
    );
  }

  listMemberships(context: AuthorizationContext): Promise<TenantMembershipSummary[]> {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.read"],
      async (transaction) => {
        const membershipRows = await transaction
          .select({
            id: tenantMemberships.id,
            userId: tenantMemberships.userId,
            email: userProfiles.email,
            displayName: userProfiles.displayName,
            status: tenantMemberships.status,
            allBranches: tenantMemberships.allBranches,
            createdAt: tenantMemberships.createdAt,
          })
          .from(tenantMemberships)
          .innerJoin(userProfiles, eq(userProfiles.id, tenantMemberships.userId))
          .where(
            and(
              eq(tenantMemberships.tenantId, tenantId),
              sql`not exists (
                select 1
                from public.tenant_member_roles customer_assignment
                join public.roles customer_role
                  on customer_role.id = customer_assignment.role_id
                where customer_assignment.tenant_id = ${tenantMemberships.tenantId}
                  and customer_assignment.membership_id = ${tenantMemberships.id}
                  and customer_role.key = 'customer'
              )`,
            ),
          )
          .orderBy(asc(userProfiles.email));
        const roleRows = await transaction
          .select({
            membershipId: tenantMemberRoles.membershipId,
            id: roles.id,
            key: roles.key,
            name: roles.name,
          })
          .from(tenantMemberRoles)
          .innerJoin(roles, eq(roles.id, tenantMemberRoles.roleId))
          .where(eq(tenantMemberRoles.tenantId, tenantId))
          .orderBy(asc(roles.name));
        const branchRows = await transaction
          .select({
            membershipId: tenantMembershipBranches.membershipId,
            id: branches.id,
            code: branches.code,
            name: branches.name,
            active: branches.active,
          })
          .from(tenantMembershipBranches)
          .innerJoin(
            branches,
            and(
              eq(branches.tenantId, tenantMembershipBranches.tenantId),
              eq(branches.id, tenantMembershipBranches.branchId),
            ),
          )
          .where(eq(tenantMembershipBranches.tenantId, tenantId))
          .orderBy(asc(branches.name));

        return membershipRows.map((membership) => ({
          ...membership,
          isCurrentUser: membership.userId === context.user.id,
          roles: roleRows
            .filter((role) => role.membershipId === membership.id)
            .map(({ membershipId: _membershipId, ...role }) => role),
          branches: branchRows
            .filter((branch) => branch.membershipId === membership.id)
            .map(({ membershipId: _membershipId, ...branch }) => branch),
        }));
      },
    );
  }

  listInvitations(context: AuthorizationContext) {
    return this.invitations.listTenantInvitations(context);
  }

  addMembership(context: AuthorizationContext, input: InviteMembershipDto) {
    return this.invitations.inviteTenantMember(context, input);
  }

  resendMembershipInvitation(context: AuthorizationContext, invitationId: string) {
    return this.invitations.resendTenantInvitation(context, invitationId);
  }

  revokeMembershipInvitation(context: AuthorizationContext, invitationId: string) {
    return this.invitations.revokeTenantInvitation(context, invitationId);
  }

  async updateMembership(
    context: AuthorizationContext,
    membershipId: string,
    input: UpdateMembershipDto,
  ) {
    const tenantId = tenantIdFrom(context);
    try {
      return await this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["memberships.manage"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_set_tenant_membership_status(
              ${membershipId}::uuid,
              ${input.status}::public.membership_status
            )
          `);
          const [membership] = await transaction
            .select()
            .from(tenantMemberships)
            .where(
              and(
                eq(tenantMemberships.tenantId, tenantId),
                eq(tenantMemberships.id, membershipId),
              ),
            )
            .limit(1);
          await recordAudit(
            transaction,
            context,
            "membership.status_changed",
            "membership",
            membershipId,
            { status: input.status },
          );
          return membership ?? { id: membershipId, status: input.status };
        },
      );
    } catch (error) {
      mapTenantMutationError(error);
    }
  }

  async updateMembershipAccess(
    context: AuthorizationContext,
    membershipId: string,
    input: UpdateMembershipAccessDto,
  ) {
    const tenantId = tenantIdFrom(context);
    try {
      return await this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["memberships.manage"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_set_tenant_membership_branch_access(
              ${membershipId}::uuid,
              ${input.allBranches},
              ${input.branchIds}::uuid[]
            )
          `);
          await recordAudit(
            transaction,
            context,
            "membership.access_changed",
            "membership",
            membershipId,
            { allBranches: input.allBranches, branchIds: input.branchIds },
          );
          return {
            membershipId,
            allBranches: input.allBranches,
            branchIds: input.branchIds,
          };
        },
      );
    } catch (error) {
      mapTenantMutationError(error);
    }
  }

  async assignRole(
    context: AuthorizationContext,
    membershipId: string,
    input: AssignRoleDto,
  ) {
    const tenantId = tenantIdFrom(context);
    try {
      return await this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["memberships.manage"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_assign_tenant_role(
              ${membershipId}::uuid,
              ${input.roleId}::uuid
            )
          `);
          await recordAudit(
            transaction,
            context,
            "membership.role_assigned",
            "membership",
            membershipId,
            { roleId: input.roleId },
          );
          return { membershipId, roleId: input.roleId };
        },
      );
    } catch (error) {
      mapTenantMutationError(error);
    }
  }

  async revokeRole(
    context: AuthorizationContext,
    membershipId: string,
    roleId: string,
  ) {
    const tenantId = tenantIdFrom(context);
    try {
      return await this.database.withTenantTransaction(
        context.user.id,
        tenantId,
        ["memberships.manage"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_revoke_tenant_role(
              ${membershipId}::uuid,
              ${roleId}::uuid
            )
          `);
          await recordAudit(
            transaction,
            context,
            "membership.role_revoked",
            "membership",
            membershipId,
            { roleId },
          );
          return { membershipId, roleId, revoked: true };
        },
      );
    } catch (error) {
      mapTenantMutationError(error);
    }
  }

  listRoles(context: AuthorizationContext): Promise<TenantRoleSummary[]> {
    const tenantId = tenantIdFrom(context);
    return this.database.withTenantTransaction(
      context.user.id,
      tenantId,
      ["memberships.read"],
      async (transaction) => {
        const rows = await transaction
          .select({
            id: roles.id,
            key: roles.key,
            name: roles.name,
            system: roles.system,
            permission: rolePermissions.permissionCode,
          })
          .from(roles)
          .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
          .where(
            and(
              eq(roles.scope, "tenant"),
              ne(roles.key, "customer"),
              or(isNull(roles.tenantId), eq(roles.tenantId, tenantId)),
            ),
          )
          .orderBy(asc(roles.name), asc(rolePermissions.permissionCode));
        const grouped = new Map<string, TenantRoleSummary>();
        for (const row of rows) {
          const role = grouped.get(row.id) ?? {
            id: row.id,
            key: row.key,
            name: row.name,
            system: row.system,
            permissions: [],
            accessPolicy: roleAccessPolicy(row.key),
            requiresOwnerAuthority: row.key === "tenant_owner",
          };
          if (row.permission !== null) {
            role.permissions.push(row.permission);
          }
          grouped.set(row.id, role);
        }
        return [...grouped.values()];
      },
    );
  }
}

async function assertActiveBranch(
  transaction: DatabaseTransaction,

  tenantId: string,
  branchId: string,
): Promise<void> {
  const [branch] = await transaction
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.tenantId, tenantId),
        eq(branches.id, branchId),
        eq(branches.active, true),
      ),
    )
    .limit(1);
  if (branch === undefined) {
    throw new NotFoundException("Active branch not found or is outside your access.");
  }
}

function roleAccessPolicy(
  roleKey: string,
): "tenant_wide" | "branch_required" | "flexible" {
  if (roleKey === "tenant_owner" || roleKey === "tenant_admin") {
    return "tenant_wide";
  }
  if (roleKey === "branch_manager" || roleKey === "cashier") {
    return "branch_required";
  }
  return "flexible";
}

function mapTenantMutationError(error: unknown): never {
  if (
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof NotFoundException
  ) {
    throw error;
  }
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? "Retailer administration change failed.";
  if (candidate.code === "42501") {
    throw new ForbiddenException(message);
  }
  if (candidate.code === "P0002") {
    throw new NotFoundException(message);
  }
  if (
    candidate.code === "23503" ||
    candidate.code === "23505" ||
    candidate.code === "23514"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
