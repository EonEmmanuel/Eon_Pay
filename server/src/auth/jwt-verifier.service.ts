import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyResult,
} from "jose";
import type { AuthenticatedUser } from "../common/request-context.js";
import type { Environment } from "../config/environment.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtVerifierService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<Environment, true>) {
    const supabaseUrl = config.get("SUPABASE_URL", { infer: true }).replace(/\/+$/, "");
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.audience = config.get("SUPABASE_JWT_AUDIENCE", { infer: true });
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
      timeoutDuration: 5_000,
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    let result: JWTVerifyResult<JWTPayload>;

    try {
      result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["ES256", "RS256"],
        clockTolerance: 5,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired access token.");
    }

    const subject = result.payload.sub;
    if (subject === undefined || !uuidPattern.test(subject)) {
      throw new UnauthorizedException("Access token has an invalid subject.");
    }

    const email =
      typeof result.payload["email"] === "string" ? result.payload["email"] : undefined;
    const sessionId =
      typeof result.payload["session_id"] === "string"
        ? result.payload["session_id"]
        : undefined;
    const assuranceLevel =
      result.payload["aal"] === "aal1" || result.payload["aal"] === "aal2"
        ? result.payload["aal"]
        : undefined;

    return {
      id: subject,
      ...(email === undefined ? {} : { email }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(assuranceLevel === undefined ? {} : { assuranceLevel }),
    };
  }
}
