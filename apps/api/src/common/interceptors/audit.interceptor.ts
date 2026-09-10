import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { calculateAuditHash } from '../utils/hash.util';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only audit mutating actions
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const startTime = new Date();
    const user = request.user;
    const tenantId = user?.tenantId;

    return next.handle().pipe(
      tap(async (responseBody) => {
        if (!tenantId) return;

        try {
          // Retrieve last audit event to maintain cryptographic chain
          const lastEvent = await this.prisma.auditEvent.findFirst({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            select: { hash: true },
          });

          const action = `${method} ${request.route?.path || request.url}`;
          const entityType = request.url.split('/')[3] || 'UNKNOWN';
          const entityId = responseBody?.id || request.params?.id || 'N/A';
          const ip = request.ip || request.headers['x-forwarded-for'] || '127.0.0.1';
          const userAgent = request.headers['user-agent'] || 'Unknown';
          const requestId = request.requestId;

          const hash = calculateAuditHash(
            lastEvent?.hash,
            tenantId,
            action,
            entityType,
            entityId,
            startTime,
            request.body,
            responseBody,
          );

          await this.prisma.auditEvent.create({
            data: {
              tenantId,
              actorUserId: user.userId,
              action,
              entityType,
              entityId: String(entityId),
              beforeSnapshot: request.body ? (request.body as any) : undefined,
              afterSnapshot: responseBody ? (responseBody as any) : undefined,
              ip: String(ip),
              userAgent: String(userAgent),
              requestId,
              hash,
              previousHash: lastEvent?.hash || null,
              createdAt: startTime,
            },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to record audit event: ${err.message}`);
        }
      }),
    );
  }
}
