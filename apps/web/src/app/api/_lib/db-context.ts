import {
  getKanonDb,
  type KanonDb,
  type SystemDbReason,
  withSystemContext,
  withTenantContext,
} from "@kanon/core/db";

/** Runs DB work inside a transaction bound to the authenticated tenant (`kanon.current_user_id`). */
export async function withUserDb<T>(userId: string, fn: (tx: KanonDb) => Promise<T>): Promise<T> {
  const db = await getKanonDb();
  return withTenantContext(db, userId, fn);
}

/** Runs DB work inside a transaction with explicit system RLS bypass and audited reason. */
export async function withSystemDb<T>(
  reason: SystemDbReason,
  fn: (tx: KanonDb) => Promise<T>,
): Promise<T> {
  const db = await getKanonDb();
  return withSystemContext(db, reason, fn);
}
