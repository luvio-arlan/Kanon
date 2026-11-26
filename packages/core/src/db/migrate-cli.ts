import postgres from "postgres";
import { KANON_MIGRATIONS, runKanonMigrations } from "./migrations";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    process.stderr.write("DATABASE_URL is not set. Aborting db:migrate.\n");
    process.exit(1);
  }
  const sqlClient = postgres(url, { prepare: false, max: 1, connect_timeout: 15 });
  try {
    await sqlClient`SELECT pg_advisory_lock(720194821)`;
    let applied = new Set<string>();
    try {
      const rows = await sqlClient<{ id: string }[]>`SELECT id FROM schema_migrations`;
      applied = new Set(rows.map((r) => r.id));
    } catch {
      applied = new Set();
    }
    const pending = KANON_MIGRATIONS.filter((m) => !applied.has(m.id));
    await runKanonMigrations(async (stmt) => {
      await sqlClient.unsafe(stmt);
    }, applied);
    process.stdout.write(
      `[kanon db:migrate] Completed (${pending.length} applied, ${KANON_MIGRATIONS.length} total).\n`,
    );
  } finally {
    await sqlClient`SELECT pg_advisory_unlock(720194821)`.catch(() => undefined);
    await sqlClient.end({ timeout: 5 });
  }
}

void main();
