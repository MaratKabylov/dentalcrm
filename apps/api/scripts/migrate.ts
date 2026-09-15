import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

const migrationPath = fileURLToPath(new URL("../drizzle/0000_foundation.sql", import.meta.url));
const migration = await readFile(migrationPath, "utf8");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query("BEGIN");
  await client.query(migration);
  await client.query("COMMIT");
  console.info("Applied 0000_foundation.sql");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
