import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./request-context.js";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
    const supplied = request.header("x-request-id");
    const requestId =
      supplied !== undefined && /^[A-Za-z0-9._-]{1,100}$/.test(supplied)
        ? supplied
        : randomUUID();

    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  }
}
