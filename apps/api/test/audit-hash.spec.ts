import { calculateAuditHash } from '../src/common/utils/hash.util';

describe('Audit Trail Cryptographic Hashing Specification', () => {
  it('should generate a deterministic SHA-256 hash for an audit record', () => {
    const tenantId = 'tenant-test-1';
    const action = 'POST /api/v1/chairs';
    const entityType = 'chairs';
    const entityId = 'chair-101';
    const createdAt = new Date('2026-09-10T12:00:00.000Z');
    const before = null;
    const after = { name: 'Dental Chair 1', status: 'OPERATIONAL' };

    const hash1 = calculateAuditHash(null, tenantId, action, entityType, entityId, createdAt, before, after);
    const hash2 = calculateAuditHash(null, tenantId, action, entityType, entityId, createdAt, before, after);

    expect(hash1).toBeDefined();
    expect(hash1).toHaveLength(64); // SHA-256 hex length
    expect(hash1).toEqual(hash2);
  });

  it('should produce a different hash if any data in the payload is altered (tamper detection)', () => {
    const tenantId = 'tenant-test-1';
    const action = 'POST /api/v1/chairs';
    const entityType = 'chairs';
    const entityId = 'chair-101';
    const createdAt = new Date('2026-09-10T12:00:00.000Z');

    const originalHash = calculateAuditHash(
      null,
      tenantId,
      action,
      entityType,
      entityId,
      createdAt,
      null,
      { name: 'Dental Chair 1' },
    );

    const tamperedHash = calculateAuditHash(
      null,
      tenantId,
      action,
      entityType,
      entityId,
      createdAt,
      null,
      { name: 'Altered Chair Name' }, // Tampered
    );

    expect(originalHash).not.toEqual(tamperedHash);
  });

  it('should chain hashes so that event N depends on event N-1', () => {
    const tenantId = 'tenant-test-1';
    const createdAt1 = new Date('2026-09-10T12:00:00.000Z');
    const createdAt2 = new Date('2026-09-10T12:01:00.000Z');

    const hash1 = calculateAuditHash(null, tenantId, 'CREATE_ORG', 'org', 'org-1', createdAt1);
    const hash2 = calculateAuditHash(hash1, tenantId, 'CREATE_BRANCH', 'branch', 'br-1', createdAt2);

    expect(hash2).toBeDefined();
    expect(hash2).not.toEqual(hash1);
  });
});
