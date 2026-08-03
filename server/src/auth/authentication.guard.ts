import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../common/decorators.js";
import type { AuthenticatedRequest } from "../common/request-context.js";
import { JwtVerifierService } from "./jwt-verifier.service.js";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtVerifier: JwtVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? "");
    if (match?.[1] === undefined) {
      throw new UnauthorizedException("A Bearer access token is required.");
    }

    request.user = await this.jwtVerifier.verify(match[1]);
    return true;
  }
}
