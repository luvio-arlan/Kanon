import { eq } from "drizzle-orm";
import type { KanonDb } from "../../client";
import { loginLockoutsTable } from "../../schema";

const LOCKOUT_THRESHOLD = 5;
const MAX_LOCKOUT_SECONDS = 15 * 60;

export async function checkAccountLockout(
  db: KanonDb,
  accountKey: string,
  now = new Date(),
): Promise<{ locked: boolean; retryAfterSec: number }> {
  const [row] = await db
    .select()
    .from(loginLockoutsTable)
    .where(eq(loginLockoutsTable.accountKey, accountKey))
    .limit(1);
  if (!row?.lockedUntil || row.lockedUntil.getTime() <= now.getTime()) {
    return { locked: false, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000));
  return { locked: true, retryAfterSec };
}

export async function recordFailedLoginAttempt(
  db: KanonDb,
  accountKey: string,
  now = new Date(),
): Promise<{ failedAttempts: number; retryAfterSec: number }> {
  const [existing] = await db
    .select()
    .from(loginLockoutsTable)
    .where(eq(loginLockoutsTable.accountKey, accountKey))
    .limit(1);
  const nextAttempts = (existing?.failedAttempts ?? 0) + 1;
  const lockoutSec =
    nextAttempts >= LOCKOUT_THRESHOLD
      ? Math.min(MAX_LOCKOUT_SECONDS, 30 * 2 ** (nextAttempts - LOCKOUT_THRESHOLD))
      : 0;
  const lockedUntil = lockoutSec > 0 ? new Date(now.getTime() + lockoutSec * 1000) : null;
  await db
    .insert(loginLockoutsTable)
    .values({
      accountKey,
      failedAttempts: nextAttempts,
      lockedUntil,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: loginLockoutsTable.accountKey,
      set: { failedAttempts: nextAttempts, lockedUntil, updatedAt: now },
    });
  return { failedAttempts: nextAttempts, retryAfterSec: lockoutSec };
}

export async function clearAccountLockout(db: KanonDb, accountKey: string): Promise<void> {
  await db.delete(loginLockoutsTable).where(eq(loginLockoutsTable.accountKey, accountKey));
}
