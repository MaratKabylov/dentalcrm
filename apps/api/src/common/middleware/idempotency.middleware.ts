import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey || req.method === 'GET' || req.method === 'HEAD') {
      return next();
    }

    const tenantId = (req as any).user?.tenantId || (req.headers['x-tenant-id'] as string) || 'global';
    const endpoint = `${req.method} ${req.originalUrl}`;

    try {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          tenantId_key: {
            tenantId,
            key: idempotencyKey,
          },
        },
      });

      if (existing) {
        res.setHeader('X-Cache-Lookup', 'HIT');
        return res.status(existing.responseStatus).json(existing.responseBody);
      }

      // Intercept response to store for future identical requests
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Store asynchronously
          this.prisma.idempotencyRecord
            .create({
              data: {
                tenantId,
                key: idempotencyKey,
                endpoint,
                responseStatus: res.statusCode,
                responseBody: body as any,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
              },
            })
            .catch(() => {
              // Ignore duplicate record errors
            });
        }
        return originalJson(body);
      };

      next();
    } catch {
      // If DB is offline or table does not exist yet, allow request to proceed
      next();
    }
  }
}
