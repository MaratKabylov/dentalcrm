import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL connection established via Prisma.');
    } catch (err: any) {
      this.logger.warn(`Could not connect to database immediately: ${err.message}. Proceeding (may be in test or offline mode).`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('PostgreSQL connection closed.');
  }

  /**
   * Helper to verify tenant isolation at the query level.
   * Ensures that any tenant-scoped entity lookup belongs to the provided tenantId.
   */
  ensureTenantScope<T extends { tenantId: string }>(entity: T | null, expectedTenantId: string): T | null {
    if (!entity) return null;
    if (entity.tenantId !== expectedTenantId) {
      throw new Error(`Tenant isolation violation: entity tenant ${entity.tenantId} != requested tenant ${expectedTenantId}`);
    }
    return entity;
  }
}
