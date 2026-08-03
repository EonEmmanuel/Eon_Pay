import type { Request } from "express";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email?: string;
  readonly sessionId?: string;
  readonly assuranceLevel?: "aal1" | "aal2";
}

export interface AuthorizationContext {
  readonly user: AuthenticatedUser;
  readonly tenantId?: string;
  readonly permissions: ReadonlySet<string>;
  readonly platformMfaRequired?: boolean;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  authorization?: AuthorizationContext;
  requestId?: string;
}
