import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import type { AuthorizationContext } from "../common/request-context.js";
import { recordAudit } from "../common/persistence.js";
import {
  type DatabaseTransaction,
  DatabaseService,
} from "../database/database.service.js";
import {
  platformRoleAssignments,
  rolePermissions,
  roles,
  userProfiles,
} from "../database/schema.js";
import type {
  UpdatePlatformAccessDto,
  UpdatePlatformProfileDto,
} from "./platform-access.dto.js";
import { sql } from "drizzle-orm";

@Injectable()
export class PlatformAccessService {
  constructor(private readonly database: DatabaseService) {}

  users(context: AuthorizationContext): Promise<PlatformUser[]> {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.read"],
      async (transaction) => {
        const rows = await transaction
          .select({
            id: userProfiles.id,
            email: userProfiles.email,
            displayName: userProfiles.displayName,
            disabled: userProfiles.disabled,
            createdAt: userProfiles.createdAt,
            updatedAt: userProfiles.updatedAt,
            roleId: roles.id,
            roleKey: roles.key,
            roleName: roles.name,
          })
          .from(platformRoleAssignments)
          .innerJoin(userProfiles, eq(userProfiles.id, platformRoleAssignments.userId))
          .innerJoin(
            roles,
            and(
              eq(roles.id, platformRoleAssignments.roleId),
              eq(roles.scope, "platform"),
            ),
          )
          .orderBy(asc(userProfiles.email), asc(roles.name));

        return groupPlatformUsers(rows);
      },
    );
  }

  platformRoles(context: AuthorizationContext) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.read"],
      async (transaction) => {
        const rows = await transaction
          .select({
            id: roles.id,
            key: roles.key,
            name: roles.name,
            permissionCode: rolePermissions.permissionCode,
          })
          .from(roles)
          .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
          .where(eq(roles.scope, "platform"))
          .orderBy(asc(roles.name), asc(rolePermissions.permissionCode));
        const byRole = new Map<
          string,
          {
            id: string;
            key: string;
            name: string;
            permissions: string[];
            assignable: boolean;
          }
        >();
        for (const row of rows) {
          const role = byRole.get(row.id) ?? {
            id: row.id,
            key: row.key,
            name: row.name,
            permissions: [],
            assignable:
              context.permissions.has("platform.users.roles.manage") &&
              (row.key !== "platform_owner" ||
                context.permissions.has("platform.owners.manage")),
          };
          role.permissions.push(row.permissionCode);
          byRole.set(row.id, role);
        }
        return [...byRole.values()];
      },
    );
  }

  updateProfile(
    context: AuthorizationContext,
    userId: string,
    input: UpdatePlatformProfileDto,
  ) {
    return this.database.withPlatformTransaction(
      context.user.id,
      ["platform.users.update"],
      async (transaction) => {
        await this.assertPlatformIdentity(transaction, userId);
        const [updated] = await transaction
          .update(userProfiles)
          .set({ displayName: input.displayName.trim() })
          .where(eq(userProfiles.id, userId))
          .returning();
        if (updated === undefined) {
          throw new NotFoundException("Platform user not found.");
        }
        await recordAudit(
          transaction,
          context,
          "platform.user.profile_updated",
          "user_profile",
          userId,
          { displayName: updated.displayName },
        );
        return updated;
      },
    );
  }

  updateAccess(
    context: AuthorizationContext,
    userId: string,
    input: UpdatePlatformAccessDto,
  ) {
    return this.database
      .withPlatformTransaction(
        context.user.id,
        ["platform.users.disable"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_set_platform_user_disabled(
              ${userId}::uuid,
              ${input.disabled},
              ${context.requestId ?? null},
              ${context.ipAddress ?? null},
              ${context.userAgent ?? null}
            )
          `);
          const [updated] = await transaction
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.id, userId))
            .limit(1);
          if (updated === undefined) {
            throw new NotFoundException("Platform user not found.");
          }
          return updated;
        },
      )
      .catch(mapPlatformMutationError);
  }

  assignRole(context: AuthorizationContext, userId: string, roleId: string) {
    return this.database
      .withPlatformTransaction(
        context.user.id,
        ["platform.users.roles.manage"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_assign_platform_role(
              ${userId}::uuid,
              ${roleId}::uuid,
              ${context.requestId ?? null},
              ${context.ipAddress ?? null},
              ${context.userAgent ?? null}
            )
          `);
          return { userId, roleId };
        },
      )
      .catch(mapPlatformMutationError);
  }

  revokeRole(context: AuthorizationContext, userId: string, roleId: string) {
    return this.database
      .withPlatformTransaction(
        context.user.id,
        ["platform.users.roles.manage"],
        async (transaction) => {
          await transaction.execute(sql`
            select public.app_revoke_platform_role(
              ${userId}::uuid,
              ${roleId}::uuid,
              ${context.requestId ?? null},
              ${context.ipAddress ?? null},
              ${context.userAgent ?? null}
            )
          `);
          return { userId, roleId };
        },
      )
      .catch(mapPlatformMutationError);
  }

  private async assertPlatformIdentity(
    transaction: DatabaseTransaction,
    userId: string,
  ): Promise<void> {
    const [assignment] = await transaction
      .select({ userId: platformRoleAssignments.userId })
      .from(platformRoleAssignments)
      .where(eq(platformRoleAssignments.userId, userId))
      .limit(1);
    if (assignment === undefined) {
      throw new NotFoundException("Platform user not found.");
    }
  }
}

export interface PlatformUser {
  id: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  roles: Array<{ roleId: string; roleKey: string; roleName: string }>;
}

interface PlatformUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  roleId: string;
  roleKey: string;
  roleName: string;
}

function groupPlatformUsers(rows: PlatformUserRow[]): PlatformUser[] {
  const users = new Map<string, PlatformUser>();
  for (const row of rows) {
    const user = users.get(row.id) ?? {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      disabled: row.disabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      roles: [],
    };
    user.roles.push({
      roleId: row.roleId,
      roleKey: row.roleKey,
      roleName: row.roleName,
    });
    users.set(row.id, user);
  }
  return [...users.values()];
}

function mapPlatformMutationError(error: unknown): never {
  if (
    error instanceof ConflictException ||
    error instanceof ForbiddenException ||
    error instanceof NotFoundException
  ) {
    throw error;
  }
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? "Platform access mutation failed.";
  if (candidate.code === "42501") {
    throw new ForbiddenException(message);
  }
  if (candidate.code === "P0002") {
    throw new NotFoundException(message);
  }
  if (candidate.code === "23505" || candidate.code === "23514") {
    throw new ConflictException(message);
  }
  throw error;
}
