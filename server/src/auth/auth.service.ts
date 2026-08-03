import { Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { tenantMemberships, tenants } from "../database/schema.js";
import type { AuthenticatedUser } from "../common/request-context.js";

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  memberships(userId: string) {
    return this.database.withIdentityTransaction(userId, (transaction) =>
      transaction
        .select({
          id: tenantMemberships.id,
          tenantId: tenantMemberships.tenantId,
          status: tenantMemberships.status,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          onboardingStatus: tenants.onboardingStatus,
        })
        .from(tenantMemberships)
        .innerJoin(
          tenants,
          and(eq(tenants.id, tenantMemberships.tenantId), eq(tenants.active, true)),
        )
        .where(
          and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.status, "active"),
          ),
        )
        .orderBy(asc(tenants.name)),
    );
  }

  async platformAccess(user: AuthenticatedUser) {
    const permissions = await this.database.authorizePlatform(user.id, []);
    const allowed = permissions.size > 0;
    const mfaRequired = allowed
      ? await this.database.platformMfaRequired(user.id)
      : false;

    return {
      allowed,
      permissions: [...permissions].sort(),
      mfaRequired,
      mfaSatisfied: !mfaRequired || user.assuranceLevel === "aal2",
    };
  }
}
