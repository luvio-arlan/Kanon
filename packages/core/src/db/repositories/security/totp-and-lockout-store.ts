import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { TotpStatusResponse } from "../../../contracts/auth-contracts";
import {
  buildTotpUri,
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  needsEnvelopeReencryption,
  verifyTotpCode,
} from "../../../security/totp";
import { type KanonDb, runInTransaction } from "../../client";
import { userTotpFactorsTable } from "../../schema";

export {
  checkAccountLockout,
  clearAccountLockout,
  recordFailedLoginAttempt,
} from "./login-lockout-store";

export class TotpAlreadyEnabledError extends Error {
  constructor() {
    super("两步验证已处于开启状态，如需重置请先使用验证码停用。");
    this.name = "TotpAlreadyEnabledError";
  }
}

function totpEnvelopeCtx(userId: string) {
  return { purpose: "totp" as const, userId };
}

async function decryptAndUpgradeTotpSecret(
  db: KanonDb,
  userId: string,
  stored: string,
): Promise<string | null> {
  const ctx = totpEnvelopeCtx(userId);
  const plain = decryptSecretEnvelope(stored, ctx);
  if (!plain) return null;
  if (needsEnvelopeReencryption(stored)) {
    const upgraded = encryptSecretEnvelope(plain, ctx);
    await db
      .update(userTotpFactorsTable)
      .set({ secretEncrypted: upgraded, updatedAt: new Date() })
      .where(eq(userTotpFactorsTable.userId, userId));
  }
  return plain;
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
  const [existing] = await db
    .select({ enabled: userTotpFactorsTable.enabled })
    .from(userTotpFactorsTable)
    .where(eq(userTotpFactorsTable.userId, userId))
    .limit(1);
  if (existing?.enabled) {
    throw new TotpAlreadyEnabledError();
  }
  const secret = generateTotpSecret();
  const encrypted = encryptSecretEnvelope(secret, totpEnvelopeCtx(userId));
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
  if (!row || row.enabled) return { ok: false };
  const secret = await decryptAndUpgradeTotpSecret(db, userId, row.secretEncrypted);
  if (!secret) return { ok: false };
  const verified = verifyTotpCode({ secretBase32: secret, inputCode: code });
  if (!verified.valid) return { ok: false };
  const recoveryCodes = generateRecoveryCodes(8);
  const hashes = recoveryCodes.map(hashRecoveryCode);
  const updated = await db
    .update(userTotpFactorsTable)
    .set({
      enabled: true,
      recoveryHashes: hashes,
      lastUsedStep: verified.matchedStep,
      updatedAt: new Date(),
    })
    .where(and(eq(userTotpFactorsTable.userId, userId), eq(userTotpFactorsTable.enabled, false)))
    .returning();
  if (updated.length === 0) return { ok: false };
  return { ok: true, recoveryCodes };
}

async function consumeRecoveryCodeAtomic(
  db: KanonDb,
  userId: string,
  hashed: string,
): Promise<boolean> {
  return runInTransaction(db, async (tx) => {
    const locked = await tx.execute(sql`
      SELECT recovery_hashes FROM user_totp_factors
      WHERE user_id = ${userId} AND enabled = TRUE
      FOR UPDATE
    `);
    const rows = (Array.isArray(locked) ? locked : locked.rows) as Array<{
      recovery_hashes?: unknown;
    }>;
    const rawHashes = rows[0]?.recovery_hashes;
    const current = Array.isArray(rawHashes)
      ? rawHashes.filter((v): v is string => typeof v === "string")
      : [];
    if (!current.includes(hashed)) return false;
    const remaining = current.filter((h) => h !== hashed);
    await tx
      .update(userTotpFactorsTable)
      .set({ recoveryHashes: remaining, updatedAt: new Date() })
      .where(and(eq(userTotpFactorsTable.userId, userId), eq(userTotpFactorsTable.enabled, true)));
    return true;
  });
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
  const secret = await decryptAndUpgradeTotpSecret(db, userId, row.secretEncrypted);
  if (!secret) return false;
  const verified = verifyTotpCode({
    secretBase32: secret,
    inputCode: code,
    lastUsedStep: row.lastUsedStep,
  });
  if (verified.valid && verified.matchedStep !== null) {
    const updated = await db
      .update(userTotpFactorsTable)
      .set({ lastUsedStep: verified.matchedStep, updatedAt: new Date() })
      .where(
        and(
          eq(userTotpFactorsTable.userId, userId),
          eq(userTotpFactorsTable.enabled, true),
          or(
            isNull(userTotpFactorsTable.lastUsedStep),
            lt(userTotpFactorsTable.lastUsedStep, verified.matchedStep),
          ),
        ),
      )
      .returning();
    return updated.length > 0;
  }
  return consumeRecoveryCodeAtomic(db, userId, hashRecoveryCode(code));
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
