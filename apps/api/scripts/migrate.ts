import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dental:local-development-only@localhost:5432/dental";

const migrationsDirectory = fileURLToPath(new URL("../drizzle", import.meta.url));
const migrationFiles = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const migrationFile of migrationFiles) {
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [migrationFile]);
    if (applied.rowCount) continue;
    const migration = await readFile(`${migrationsDirectory}/${migrationFile}`, "utf8");
    await client.query("BEGIN");
    await client.query(migration);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationFile]);
    await client.query("COMMIT");
    console.info(`Applied ${migrationFile}`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
