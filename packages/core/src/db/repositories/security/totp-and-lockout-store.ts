import { eq } from "drizzle-orm";
import type { TotpStatusResponse } from "../../../contracts/auth-contracts";
import {
  buildTotpUri,
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "../../../security/totp";
import type { KanonDb } from "../../client";
import { loginLockoutsTable, userTotpFactorsTable } from "../../schema";

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

export async function getUserTotpStatus(db: KanonDb, userId: string): Promise<TotpStatusResponse> {
  const [row] = await db
    .select()
    .from(userTotpFactorsTable)
    .where(eq(userTotpFactorsTable.userId, userId))
    .limit(1);
  return {
    enabled: Boolean(row?.enabled),
    recoveryCodesRemaining: row?.enabled ? row.recoveryHashes.length : 0,
  };
}

export async function beginTotpEnrollment(
  db: KanonDb,
  userId: string,
  accountLabel: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = generateTotpSecret();
  const encrypted = encryptSecretEnvelope(secret);
  const now = new Date();
  await db
    .insert(userTotpFactorsTable)
    .values({
      userId,
      secretEncrypted: encrypted,
      enabled: false,
      recoveryHashes: [],
      lastUsedStep: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userTotpFactorsTable.userId,
      set: {
        secretEncrypted: encrypted,
        enabled: false,
        recoveryHashes: [],
        lastUsedStep: null,
        updatedAt: now,
      },
    });
  return { secret, otpauthUri: buildTotpUri(secret, accountLabel) };
}

export async function confirmTotpEnrollment(
  db: KanonDb,
  userId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const [row] = await db
    .select()
    .from(userTotpFactorsTable)
    .where(eq(userTotpFactorsTable.userId, userId))
    .limit(1);
  if (!row) return { ok: false };
  const secret = decryptSecretEnvelope(row.secretEncrypted);
  if (!secret) return { ok: false };
  const verified = verifyTotpCode({ secretBase32: secret, inputCode: code });
  if (!verified.valid) return { ok: false };
  const recoveryCodes = generateRecoveryCodes(8);
  const hashes = recoveryCodes.map(hashRecoveryCode);
  await db
    .update(userTotpFactorsTable)
    .set({
      enabled: true,
      recoveryHashes: hashes,
      lastUsedStep: verified.matchedStep,
      updatedAt: new Date(),
    })
    .where(eq(userTotpFactorsTable.userId, userId));
  return { ok: true, recoveryCodes };
}

export async function verifyUserTotpFactor(
  db: KanonDb,
  userId: string,
  code: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(userTotpFactorsTable)
    .where(eq(userTotpFactorsTable.userId, userId))
    .limit(1);
  if (!row?.enabled) return true;
  const secret = decryptSecretEnvelope(row.secretEncrypted);
  if (!secret) return false;
  const verified = verifyTotpCode({
    secretBase32: secret,
    inputCode: code,
    lastUsedStep: row.lastUsedStep,
  });
  if (verified.valid) {
    await db
      .update(userTotpFactorsTable)
      .set({ lastUsedStep: verified.matchedStep, updatedAt: new Date() })
      .where(eq(userTotpFactorsTable.userId, userId));
    return true;
  }
  const hashed = hashRecoveryCode(code);
  if (!row.recoveryHashes.includes(hashed)) return false;
  const remaining = row.recoveryHashes.filter((h) => h !== hashed);
  await db
    .update(userTotpFactorsTable)
    .set({ recoveryHashes: remaining, updatedAt: new Date() })
    .where(eq(userTotpFactorsTable.userId, userId));
  return true;
}

export async function disableUserTotpFactor(
  db: KanonDb,
  userId: string,
  code: string,
): Promise<boolean> {
  const ok = await verifyUserTotpFactor(db, userId, code);
  if (!ok) return false;
  await db.delete(userTotpFactorsTable).where(eq(userTotpFactorsTable.userId, userId));
  return true;
}
