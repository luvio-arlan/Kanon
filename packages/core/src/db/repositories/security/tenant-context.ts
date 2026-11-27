import { sql } from "drizzle-orm";
import { type KanonDb, runInTransaction } from "../../bootstrap";

export type SystemDbReason =
  | "cron_tick"
  | "on_demand_sync"
  | "calendar_feed"
  | "health"
  | "auth_bootstrap"
  | "migration_seed"
  | "user_triggered_sync"
  | "alert_fanout"
  | "rate_limit";

/** Runs a callback inside a transaction with Postgres RLS `kanon.current_user_id` bound locally. */
export async function withTenantContext<T>(
  db: KanonDb,
  userId: string,
  fn: (tx: KanonDb) => Promise<T>,
): Promise<T> {
  return runInTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT set_config('kanon.current_user_id', ${userId}, true), set_config('kanon.system', 'off', true)`,
    );
    return fn(tx);
  });
}

/** Runs a callback inside a transaction with explicit system RLS bypass and audit reason. */
export async function withSystemContext<T>(
  db: KanonDb,
  reason: SystemDbReason,
  fn: (tx: KanonDb) => Promise<T>,
): Promise<T> {
  return runInTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT set_config('kanon.system', 'on', true), set_config('kanon.system_reason', ${reason}, true), set_config('kanon.current_user_id', '', true)`,
    );
    return fn(tx);
  });
}
