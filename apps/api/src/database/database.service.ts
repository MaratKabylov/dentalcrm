import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { getEnv } from "../config/env.js";
import * as schema from "./schema.js";

export interface TenantTransactionContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  readonly orm: NodePgDatabase<typeof schema> = drizzle(this.pool, { schema });

  async withTenant<T>(
    context: TenantTransactionContext,
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${getEnv().DB_APP_ROLE}`);
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId ?? ""]);
      await client.query("SELECT set_config('app.request_id', $1, true)", [context.requestId ?? ""]);
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async findActiveTenantIdBySlug(slug: string): Promise<string | null> {
    const row = (await this.pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE slug=$1 AND status='active'",
      [slug]
    )).rows[0];
    return row?.id ?? null;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
