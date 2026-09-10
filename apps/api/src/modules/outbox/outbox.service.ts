import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DomainEventType, DomainEvent } from '@dentalcrm/contracts';
import { OutboxStatus, Prisma } from '@prisma/client';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enqueues an event to the outbox inside an existing transaction or standalone.
   */
  async enqueueEvent<T = Record<string, unknown>>(
    tenantId: string,
    eventName: DomainEventType | string,
    payload: T,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    return client.outboxEvent.create({
      data: {
        tenantId,
        eventName,
        payload: payload as any,
        status: OutboxStatus.PENDING,
      },
    });
  }

  async getPendingEvents(limit = 50) {
    return this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    });
  }

  async markPublished(eventId: string) {
    return this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  }

  async markFailed(eventId: string, error: string) {
    return this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OutboxStatus.FAILED,
        lastError: error,
        retryCount: { increment: 1 },
      },
    });
  }
}
