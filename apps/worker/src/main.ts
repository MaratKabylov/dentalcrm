import pg, { type PoolClient } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

const appRole = process.env.DB_APP_ROLE ?? "dental_app";
if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error("DB_APP_ROLE is invalid");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
let stopping = false;

process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

while (!stopping) {
  const tenants = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE status = 'active'");
  let processed = 0;
  for (const tenant of tenants.rows) processed += await processNextForTenant(tenant.id);
  if (processed === 0) await delay(1_000);
}

await pool.end();

async function processNextForTenant(tenantId: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${appRole}`);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query<{
      id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT id, event_type, payload
       FROM outbox_events
       WHERE processed_at IS NULL AND available_at <= now()
       ORDER BY occurred_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    const event = result.rows[0];
    if (!event) {
      await client.query("COMMIT");
      return 0;
    }
    await deliverIdempotently(client, tenantId, event);
    await client.query(
      "UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1",
      [event.id]
    );
    await client.query("COMMIT");
    return 1;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Outbox delivery failed", error instanceof Error ? error.message : error);
    return 0;
  } finally {
    client.release();
  }
}

async function deliverIdempotently(
  client: PoolClient,
  tenantId: string,
  event: { id: string; event_type: string; payload: Record<string, unknown> }
): Promise<void> {
  const handler = "foundation-console-handler";
  const claimed = await client.query(
    `INSERT INTO outbox_deliveries (tenant_id, event_id, handler)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING event_id`,
    [tenantId, event.id, handler]
  );
  if (claimed.rowCount === 0) return;
  console.info(JSON.stringify({ message: "domain_event_delivered", tenantId, eventType: event.event_type, payload: event.payload }));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
