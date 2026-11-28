import {
  getKanonDb,
  type KanonDb,
  type SystemDbReason,
  withSystemContext,
  withTenantContext,
} from "@kanon/core/db";

/** Runs DB work inside a transaction bound to the authenticated tenant (`kanon.current_user_id` & `kanon.request_id`). */
export async function withUserDb<T>(
  userId: string,
  fn: (tx: KanonDb) => Promise<T>,
  requestId?: string,
): Promise<T> {
  const db = await getKanonDb();
  return withTenantContext(db, userId, fn, requestId);
}

/** Runs DB work inside a transaction with explicit system RLS bypass, audited reason, and `kanon.request_id`. */
export async function withSystemDb<T>(
  reason: SystemDbReason,
  fn: (tx: KanonDb) => Promise<T>,
  requestId?: string,
): Promise<T> {
  const db = await getKanonDb();
  return withSystemContext(db, reason, fn, requestId);
}
