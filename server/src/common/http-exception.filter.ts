import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "./request-context.js";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: "Internal server error" };
    const normalized = typeof payload === "string" ? { message: payload } : payload;

    if (!(exception instanceof HttpException)) {
      console.error("Unhandled exception:", exception);
    }

    response.status(status).json({
      statusCode: status,
      ...normalized,
      path: request.originalUrl,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
