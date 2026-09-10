import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorCode, ApiErrorResponse } from '@dentalcrm/contracts';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string) || (request as any).requestId || `req_${Date.now()}`;
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ApiErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error occurred';
    let details: Record<string, unknown> | Array<unknown> | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const errorObj = res as Record<string, any>;
        message = errorObj.message || exception.message;
        code = errorObj.code || this.mapStatusToErrorCode(status);
        details = errorObj.details || (Array.isArray(errorObj.message) ? errorObj.message : undefined);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled exception on ${request.method} ${request.url}: ${exception.message}`, exception.stack);
    }

    const payload: ApiErrorResponse = {
      error: {
        code,
        message: Array.isArray(message) ? message.join(', ') : message,
        details,
        requestId,
        timestamp,
      },
    };

    response.status(status).json(payload);
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      default:
        return ApiErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
