import * as crypto from 'crypto';

export function calculateAuditHash(
  previousHash: string | null | undefined,
  tenantId: string,
  action: string,
  entityType: string,
  entityId: string,
  createdAt: string | Date,
  beforeSnapshot?: unknown,
  afterSnapshot?: unknown
): string {
  const dataString = JSON.stringify({
    previousHash: previousHash || 'GENESIS_HASH',
    tenantId,
    action,
    entityType,
    entityId,
    createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    before: beforeSnapshot || null,
    after: afterSnapshot || null,
  });

  return crypto.createHash('sha256').update(dataString).digest('hex');
}
