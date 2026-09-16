import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

export interface AuditEntry {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId: string;
}

@Injectable()
export class AuditService {
  async append(client: PoolClient, entry: AuditEntry): Promise<void> {
    const id = randomUUID();
    const createdAt = new Date();
    const hash = createAuditHash({ id, createdAt: createdAt.toISOString(), ...entry });
    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, actor_user_id, action, entity_type, entity_id,
         before_snapshot, after_snapshot, reason, request_id, created_at, hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12)`,
      [
        id,
        entry.tenantId,
        entry.actorUserId,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
        entry.reason ?? null,
        entry.requestId,
        createdAt,
        hash
      ]
    );
  }
}

export function createAuditHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
