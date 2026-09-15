import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

export interface DomainEvent {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  requestId: string;
}

@Injectable()
export class OutboxService {
  async append(client: PoolClient, event: DomainEvent): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO outbox_events (
         id, tenant_id, aggregate_type, aggregate_id, event_type, payload, request_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        id,
        event.tenantId,
        event.aggregateType,
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.payload),
        event.requestId
      ]
    );
    return id;
  }
}
