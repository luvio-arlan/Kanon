import crypto from "node:crypto";
import { eq, lt } from "drizzle-orm";
import {
  type LoginRequest,
  LoginRequestSchema,
  maskChinaPhone,
  type PublicUser,
  type RegisterRequest,
  RegisterRequestSchema,
} from "../../contracts/auth-contracts";
import { type KanonDb, runInTransaction } from "../client";
import { sessionsTable, usersTable } from "../schema";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./auth-crypto";
import { provisionStarterWorkspaceForUser } from "./starter-workspace";

export const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

type UserRow = typeof usersTable.$inferSelect;

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    maskedPhone: maskChinaPhone(row.phoneE164),
    displayName: row.displayName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildDefaultDisplayName(phoneE164: string): string {
  const tail = phoneE164.slice(-4);
  return `研究员 ${tail}`;
}

export async function createUserSession(
  db: KanonDb,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, now));
  await db.insert(sessionsTable).values({
    id: `sess-${crypto.randomUUID().slice(0, 12)}`,
    userId,
    tokenHash,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

export async function registerUser(
  db: KanonDb,
  rawInput: RegisterRequest,
): Promise<{ user: PublicUser; sessionToken: string; expiresAt: Date }> {
  const parsed = RegisterRequestSchema.parse(rawInput);
  const passwordHash = await hashPassword(parsed.password);
  const now = new Date();
  const userId = `usr-${crypto.randomUUID().slice(0, 12)}`;
  const displayName = parsed.displayName ?? buildDefaultDisplayName(parsed.phone);

  const user = await runInTransaction(db, async (tx) => {
    const [inserted] = await tx
      .insert(usersTable)
      .values({
        id: userId,
        phoneE164: parsed.phone,
        displayName,
        passwordHash,
        role: "member",
        lastLoginAt: now,
        updatedAt: now,
        createdAt: now,
      })
      .returning();
    if (!inserted) {
      throw new Error("创建账号记录失败。");
    }
    if (parsed.seedStarterWorkspace) {
      await provisionStarterWorkspaceForUser(tx, inserted.id);
    }
    return toPublicUser(inserted);
  });

  const session = await createUserSession(db, user.id);
  return { user, sessionToken: session.token, expiresAt: session.expiresAt };
}

export async function authenticateUser(
  db: KanonDb,
  rawInput: LoginRequest,
): Promise<{ user: PublicUser; sessionToken: string; expiresAt: Date } | null> {
  const parsed = LoginRequestSchema.parse(rawInput);
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phoneE164, parsed.phone))
    .limit(1);
  if (!row || row.role === "demo") return null;

  const matched = await verifyPassword(parsed.password, row.passwordHash);
  if (!matched) return null;

  const now = new Date();
  await db
    .update(usersTable)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(usersTable.id, row.id));

  const session = await createUserSession(db, row.id);
  return { user: toPublicUser(row), sessionToken: session.token, expiresAt: session.expiresAt };
}

export async function getSessionUser(db: KanonDb, rawToken: string): Promise<PublicUser | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = hashSessionToken(rawToken);
  const rows = await db
    .select({ user: usersTable, expiresAt: sessionsTable.expiresAt, sessionId: sessionsTable.id })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(eq(sessionsTable.tokenHash, tokenHash))
    .limit(1);

  const match = rows[0];
  if (!match) return null;
  if (match.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, match.sessionId));
    return null;
  }
  return toPublicUser(match.user);
}

export async function revokeSession(db: KanonDb, rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, tokenHash));
}
