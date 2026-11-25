import { and, desc, eq, ne } from "drizzle-orm";
import type { SessionSummary } from "../../../contracts/account-contracts";
import { maskChinaPhone, type PublicUser } from "../../../contracts/auth-contracts";
import { type KanonDb, runInTransaction } from "../../client";
import { sessionsTable, usersTable } from "../../schema";
import { hashPassword, hashSessionToken, verifyPassword } from "../auth-crypto";

function toPublicUser(row: typeof usersTable.$inferSelect): PublicUser {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    maskedPhone: maskChinaPhone(row.phoneE164),
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateUserProfile(
  db: KanonDb,
  userId: string,
  displayName: string,
): Promise<PublicUser | null> {
  const [updated] = await db
    .update(usersTable)
    .set({ displayName: displayName.trim(), updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();
  return updated ? toPublicUser(updated) : null;
}

export async function changeUserPassword(params: {
  db: KanonDb;
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentRawToken: string | null;
}): Promise<{ ok: true; revokedOtherSessions: number } | { ok: false; error: string }> {
  const [user] = await params.db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.userId))
    .limit(1);
  if (!user || user.role === "demo") {
    return { ok: false, error: "当前账号不支持修改密码。" };
  }
  const matched = await verifyPassword(params.currentPassword, user.passwordHash);
  if (!matched) {
    return { ok: false, error: "当前密码不正确，请核对后重试。" };
  }
  const nextHash = await hashPassword(params.newPassword);
  const revokedOtherSessions = await runInTransaction(params.db, async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash: nextHash, updatedAt: new Date() })
      .where(eq(usersTable.id, params.userId));
    return revokeOtherUserSessions(tx, params.userId, params.currentRawToken);
  });
  return { ok: true, revokedOtherSessions };
}

export async function listUserSessions(
  db: KanonDb,
  userId: string,
  currentRawToken: string | null,
): Promise<SessionSummary[]> {
  const currentHash = currentRawToken ? hashSessionToken(currentRawToken) : null;
  const nowMs = Date.now();
  const rows = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.createdAt));

  return rows
    .filter((row) => row.expiresAt.getTime() > nowMs)
    .map((row) => ({
      id: row.id,
      isCurrent: currentHash !== null && row.tokenHash === currentHash,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
}

export async function revokeOtherUserSessions(
  db: KanonDb,
  userId: string,
  currentRawToken: string | null,
): Promise<number> {
  if (!currentRawToken) return 0;
  const currentHash = hashSessionToken(currentRawToken);
  const deleted = await db
    .delete(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), ne(sessionsTable.tokenHash, currentHash)))
    .returning();
  return deleted.length;
}
