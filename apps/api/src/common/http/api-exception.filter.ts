import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiException } from "./api.exception.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const isApiException = exception instanceof ApiException;

    response.status(status).json({
      error: {
        code: isApiException ? exception.code : status === 500 ? "INTERNAL_ERROR" : "HTTP_ERROR",
        message: isApiException ? exception.message : status === 500 ? "Unexpected server error" : String((exception as Error).message),
        details: isApiException ? exception.details : {},
        requestId: request.requestId ?? "unknown"
      }
    });
  }
}
