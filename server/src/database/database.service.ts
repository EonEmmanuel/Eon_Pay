import { ForbiddenException, Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import {
  drizzle,
  type NodePgDatabase,
  type NodePgTransaction,
} from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Environment } from "../config/environment.js";
import { postgresPoolConfig } from "./connection.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private readonly database: Database;

  constructor(config: ConfigService<Environment, true>) {
    this.pool = new Pool(
      postgresPoolConfig(config.get("DATABASE_URL", { infer: true }), {
        max: config.get("DATABASE_POOL_MAX", { infer: true }),
        application_name: "investor-ready-api",
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }),
    );
    this.database = drizzle(this.pool, { schema });
  }

  async healthCheck(): Promise<void> {
    await this.pool.query("select 1");
  }

  async authorizeTenant(
    userId: string,
    tenantId: string,
    requiredPermissions: readonly string[],
  ): Promise<ReadonlySet<string>> {
    return this.withTenantTransaction(userId, tenantId, [], async (transaction) => {
      const result = await transaction.execute<{ code: string }>(sql`
          select code
          from public.permissions
          where public.app_has_permission(code, ${tenantId}::uuid)
          order by code
        `);
      const permissions = new Set(result.rows.map((row) => row.code));
      this.assertPermissions(permissions, requiredPermissions);
      return permissions;
    });
  }

  async authorizePlatform(
    userId: string,
    requiredPermissions: readonly string[],
  ): Promise<ReadonlySet<string>> {
    return this.withPlatformTransaction(userId, [], async (transaction) => {
      const result = await transaction.execute<{ code: string }>(sql`
        select code
        from public.permissions
        where public.app_has_platform_permission(code)
        order by code
      `);
      const permissions = new Set(result.rows.map((row) => row.code));
      this.assertPermissions(permissions, requiredPermissions);
      return permissions;
    });
  }

  async platformMfaRequired(userId: string): Promise<boolean> {
    return this.withPlatformTransaction(userId, [], async (transaction) => {
      const result = await transaction.execute<{ required: boolean }>(sql`
        select public.app_platform_mfa_required() as required
      `);
      return result.rows[0]?.required !== false;
    });
  }

  async assertTenantOperational(tenantId: string, userId: string): Promise<void> {
    await this.withTenantTransaction(userId, tenantId, [], async (transaction) => {
      const result = await transaction.execute<{ active: boolean }>(sql`
        select exists (
          select 1
          from public.tenants tenant
          where tenant.id = ${tenantId}::uuid
            and tenant.active
            and tenant.onboarding_status = 'active'
        ) as active
      `);
      if (result.rows[0]?.active !== true) {
        throw new ForbiddenException({
          code: "TENANT_ONBOARDING_REQUIRED",
          message:
            "Complete retailer verification before performing operational changes.",
        });
      }
    });
  }
  async withTenantTransaction<T>(
    userId: string,
    tenantId: string,
    requiredPermissions: readonly string[],
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      await this.applyRuntimeRole(transaction);
      await transaction.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await transaction.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`,
      );
      await this.assertTenantPermissions(transaction, tenantId, requiredPermissions);
      return work(transaction);
    });
  }

  async withDeviceTransaction<T>(
    deviceId: string,
    credentialHash: string,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    void deviceId;
    void credentialHash;
    return this.database.transaction(async (transaction) => {
      await this.applyRuntimeRole(transaction);
      await transaction.execute(sql`select set_config('app.user_id', '', true)`);
      await transaction.execute(sql`select set_config('app.tenant_id', '', true)`);
      return work(transaction);
    });
  }

  async withPlatformTransaction<T>(
    userId: string,
    requiredPermissions: readonly string[],
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      await this.applyRuntimeRole(transaction);
      await transaction.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await transaction.execute(sql`select set_config('app.tenant_id', '', true)`);

      for (const permission of requiredPermissions) {
        const result = await transaction.execute<{ allowed: boolean }>(sql`
          select public.app_has_platform_permission(${permission}) as allowed
        `);
        if (result.rows[0]?.allowed !== true) {
          throw new ForbiddenException("Insufficient platform permission.");
        }
      }

      return work(transaction);
    });
  }

  async withIdentityTransaction<T>(
    userId: string,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      await this.applyRuntimeRole(transaction);
      await transaction.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await transaction.execute(sql`select set_config('app.tenant_id', '', true)`);
      return work(transaction);
    });
  }

  async withProviderTransaction<T>(
    resourceType: "payment" | "kyc" | "kyb",
    provider: string,
    externalReference: string,
    work: (transaction: DatabaseTransaction, tenantId: string) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql.raw("set local role app_provider"));
      const result = await transaction.execute<{ tenant_id: string }>(sql`
        select public.app_resolve_provider_tenant(
          ${resourceType},
          ${provider},
          ${externalReference}
        ) as tenant_id
      `);
      const tenantId = result.rows[0]?.tenant_id;
      if (tenantId === undefined) {
        throw new ForbiddenException("Provider resource could not be resolved.");
      }
      await transaction.execute(
        sql`select set_config('app.tenant_id', ${tenantId}, true)`,
      );
      await transaction.execute(sql`select set_config('app.user_id', '', true)`);
      return work(transaction, tenantId);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  private async applyRuntimeRole(transaction: DatabaseTransaction): Promise<void> {
    await transaction.execute(sql.raw("set local role app_runtime"));
  }

  private async assertTenantPermissions(
    transaction: DatabaseTransaction,
    tenantId: string,
    requiredPermissions: readonly string[],
  ): Promise<void> {
    const membership = await transaction.execute<{ active: boolean }>(sql`
      select public.app_is_active_member(${tenantId}::uuid) as active
    `);
    if (membership.rows[0]?.active !== true) {
      throw new ForbiddenException("No active membership for this tenant.");
    }

    for (const permission of requiredPermissions) {
      const result = await transaction.execute<{ allowed: boolean }>(sql`
        select public.app_has_permission(
          ${permission},
          ${tenantId}::uuid
        ) as allowed
      `);
      if (result.rows[0]?.allowed !== true) {
        throw new ForbiddenException("Insufficient tenant permission.");
      }
    }
  }

  private assertPermissions(
    granted: ReadonlySet<string>,
    required: readonly string[],
  ): void {
    if (required.some((permission) => !granted.has(permission))) {
      throw new ForbiddenException("Insufficient permission.");
    }
  }
}
