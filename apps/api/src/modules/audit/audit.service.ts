import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { calculateAuditHash } from '../../common/utils/hash.util';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAuditLogs(
    tenantId: string,
    options?: {
      entityType?: string;
      action?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where: {
          tenantId,
          ...(options?.entityType ? { entityType: options.entityType } : {}),
          ...(options?.action ? { action: { contains: options.action } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditEvent.count({
        where: {
          tenantId,
          ...(options?.entityType ? { entityType: options.entityType } : {}),
        },
      }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * Verifies the cryptographic tamper-evident SHA-256 chain of audit records.
   */
  async verifyChainIntegrity(tenantId: string) {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });

    let isValid = true;
    let compromisedEventId: string | null = null;
    let previousHash: string | null = null;

    for (const event of events) {
      const expectedHash = calculateAuditHash(
        previousHash,
        event.tenantId,
        event.action,
        event.entityType,
        event.entityId,
        event.createdAt,
        event.beforeSnapshot,
        event.afterSnapshot,
      );

      if (event.hash !== expectedHash) {
        isValid = false;
        compromisedEventId = event.id;
        break;
      }

      previousHash = event.hash;
    }

    return {
      isValid,
      totalChecked: events.length,
      compromisedEventId,
      verifiedAt: new Date().toISOString(),
    };
  }
}
