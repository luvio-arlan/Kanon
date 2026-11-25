import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  type ApiTokenSummary,
  type CreateApiTokenRequest,
  CreateApiTokenRequestSchema,
} from "../../../contracts/account-contracts";
import { maskChinaPhone, type PublicUser } from "../../../contracts/auth-contracts";
import type { KanonDb } from "../../client";
import { type ApiTokenScope, apiTokensTable, usersTable } from "../../schema";
import { hashSessionToken } from "../auth-crypto";

const PAT_PREFIX = "kanon_pat_";

function toTokenSummary(row: typeof apiTokensTable.$inferSelect): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scope: row.scope,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

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

export async function createApiToken(
  db: KanonDb,
  userId: string,
  rawInput: CreateApiTokenRequest,
): Promise<{ token: ApiTokenSummary; plaintextToken: string }> {
  const parsed = CreateApiTokenRequestSchema.parse(rawInput);
  const randomSecret = crypto.randomBytes(24).toString("hex");
  const plaintextToken = `${PAT_PREFIX}${randomSecret}`;
  const tokenPrefix = `${PAT_PREFIX}${randomSecret.slice(0, 6)}…${randomSecret.slice(-4)}`;
  const tokenHash = hashSessionToken(plaintextToken);
  const now = new Date();
  const expiresAt = parsed.expiresInDays
    ? new Date(now.getTime() + parsed.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [inserted] = await db
    .insert(apiTokensTable)
    .values({
      id: `pat-${crypto.randomUUID().slice(0, 12)}`,
      userId,
      name: parsed.name,
      tokenPrefix,
      tokenHash,
      scope: parsed.scope,
      expiresAt,
      createdAt: now,
    })
    .returning();

  if (!inserted) {
    throw new Error("创建个人访问令牌失败。");
  }
  return { token: toTokenSummary(inserted), plaintextToken };
}

export async function listApiTokens(db: KanonDb, userId: string): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select()
    .from(apiTokensTable)
    .where(eq(apiTokensTable.userId, userId))
    .orderBy(desc(apiTokensTable.createdAt));
  return rows.map(toTokenSummary);
}

export async function revokeApiToken(
  db: KanonDb,
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(apiTokensTable)
    .where(and(eq(apiTokensTable.id, tokenId), eq(apiTokensTable.userId, userId)))
    .returning();
  return deleted.length > 0;
}

export async function authenticateApiToken(
  db: KanonDb,
  rawToken: string,
): Promise<{ user: PublicUser; scope: ApiTokenScope; tokenId: string } | null> {
  if (!rawToken.startsWith(PAT_PREFIX) || rawToken.length < 32) return null;
  const tokenHash = hashSessionToken(rawToken);
  const rows = await db
    .select({ token: apiTokensTable, user: usersTable })
    .from(apiTokensTable)
    .innerJoin(usersTable, eq(apiTokensTable.userId, usersTable.id))
    .where(eq(apiTokensTable.tokenHash, tokenHash))
    .limit(1);

  const match = rows[0];
  if (!match) return null;
  if (match.token.expiresAt && match.token.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  await db
    .update(apiTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokensTable.id, match.token.id));

  return {
    user: toPublicUser(match.user),
    scope: match.token.scope,
    tokenId: match.token.id,
  };
}
