import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Generate or propagate request ID for end-to-end tracing and RFC 7807 error responses
    const incomingRequestId = req.headers['x-request-id'] as string;
    const requestId = incomingRequestId || `req_${crypto.randomBytes(8).toString('hex')}`;
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    // If client supplied x-tenant-id for public routing, capture it as a suggestion,
    // but authenticated token (AuthContext) is ALWAYS authoritative.
    const headerTenantId = req.headers['x-tenant-id'] as string;
    (req as any).suggestedTenantId = headerTenantId || null;

    next();
  }
}
