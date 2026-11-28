import crypto from "node:crypto";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { decryptSecretEnvelopeWithMeta, encryptSecretEnvelope } from "../../../security/totp";
import type { KanonDb } from "../../bootstrap";
import { aiUsageTable, userAiCredentialsTable } from "../../schema";

export interface MaskedAiCredential {
  id: string;
  provider: string;
  label: string;
  keyHint: string;
  baseUrl: string | null;
  defaultModel: string | null;
  updatedAt: string;
}

function buildKeyHint(rawKey: string): string {
  const clean = rawKey.trim();
  if (clean.length <= 6) return "••••";
  return `${clean.slice(0, 3)}••••${clean.slice(-4)}`;
}

function toMaskedCredential(row: typeof userAiCredentialsTable.$inferSelect): MaskedAiCredential {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    keyHint: row.keyHint,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UpsertAiCredentialInput {
  userId: string;
  provider: string;
  apiKey: string;
  label?: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
}

export async function upsertUserAiCredential(
  db: KanonDb,
  input: UpsertAiCredentialInput,
): Promise<MaskedAiCredential> {
  const provider = input.provider.trim().toLowerCase();
  const encryptedApiKey = encryptSecretEnvelope(input.apiKey.trim(), {
    purpose: "byok",
    userId: input.userId,
    provider,
  });
  const now = new Date();
  const mutableFields = {
    label: input.label?.trim() ?? "",
    encryptedApiKey,
    keyHint: buildKeyHint(input.apiKey),
    baseUrl: input.baseUrl?.trim() || null,
    defaultModel: input.defaultModel?.trim() || null,
    updatedAt: now,
  };
  await db
    .insert(userAiCredentialsTable)
    .values({
      id: `aicred_${crypto.randomUUID()}`,
      userId: input.userId,
      provider,
      createdAt: now,
      ...mutableFields,
    })
    .onConflictDoUpdate({
      target: [userAiCredentialsTable.userId, userAiCredentialsTable.provider],
      set: mutableFields,
    });
  const [row] = await db
    .select()
    .from(userAiCredentialsTable)
    .where(
      and(
        eq(userAiCredentialsTable.userId, input.userId),
        eq(userAiCredentialsTable.provider, provider),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Failed to read saved AI credential");
  return toMaskedCredential(row);
}

/** Lists masked user AI credentials — NEVER returns plaintext keys to the client. */
export async function listUserAiCredentials(
  db: KanonDb,
  userId: string,
): Promise<MaskedAiCredential[]> {
  const rows = await db
    .select()
    .from(userAiCredentialsTable)
    .where(eq(userAiCredentialsTable.userId, userId))
    .orderBy(asc(userAiCredentialsTable.provider));
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    keyHint: r.keyHint,
    baseUrl: r.baseUrl,
    defaultModel: r.defaultModel,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Server-only decryption of stored BYOK key when executing AI routes. */
export async function resolveUserAiCredential(
  db: KanonDb,
  userId: string,
  provider: string,
): Promise<{ apiKey: string; baseUrl: string | null; defaultModel: string | null } | null> {
  const [row] = await db
    .select()
    .from(userAiCredentialsTable)
    .where(
      and(
        eq(userAiCredentialsTable.userId, userId),
        eq(userAiCredentialsTable.provider, provider.trim().toLowerCase()),
      ),
    )
    .limit(1);
  if (!row) return null;
  const normalizedProvider = provider.trim().toLowerCase();
  const ctx = { purpose: "byok" as const, userId, provider: normalizedProvider };
  const dec = decryptSecretEnvelopeWithMeta(row.encryptedApiKey, ctx);
  if (!dec) return null;
  if (dec.usedKey !== "primary") {
    const upgraded = encryptSecretEnvelope(dec.plain, ctx);
    await db
      .update(userAiCredentialsTable)
      .set({ encryptedApiKey: upgraded, updatedAt: new Date() })
      .where(
        and(
          eq(userAiCredentialsTable.id, row.id),
          eq(userAiCredentialsTable.userId, userId),
          eq(userAiCredentialsTable.encryptedApiKey, row.encryptedApiKey),
        ),
      );
  }
  return { apiKey: dec.plain, baseUrl: row.baseUrl, defaultModel: row.defaultModel };
}

export async function deleteUserAiCredential(
  db: KanonDb,
  userId: string,
  provider: string,
): Promise<boolean> {
  const deleted = await db
    .delete(userAiCredentialsTable)
    .where(
      and(
        eq(userAiCredentialsTable.userId, userId),
        eq(userAiCredentialsTable.provider, provider.trim().toLowerCase()),
      ),
    )
    .returning();
  return deleted.length > 0;
}

export async function recordAiUsage(
  db: KanonDb,
  input: {
    userId: string;
    thesisId?: string | null;
    route: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    keySource: "byok" | "hosted";
  },
): Promise<void> {
  await db.insert(aiUsageTable).values({
    keySource: input.keySource,
    id: `aiu_${crypto.randomUUID()}`,
    userId: input.userId,
    thesisId: input.thesisId ?? null,
    route: input.route,
    provider: input.provider,
    model: input.model,
    promptTokens: Math.max(0, Math.round(input.promptTokens)),
    completionTokens: Math.max(0, Math.round(input.completionTokens)),
    costUsd: Math.max(0, input.costUsd),
  });
}

export async function summarizeMonthlyAiUsage(
  db: KanonDb,
  userId: string,
  now = new Date(),
): Promise<{ calls: number; promptTokens: number; completionTokens: number; costUsd: number }> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select()
    .from(aiUsageTable)
    .where(and(eq(aiUsageTable.userId, userId), gte(aiUsageTable.createdAt, monthStart)));
  let promptTokens = 0;
  let completionTokens = 0;
  let costUsd = 0;
  for (const r of rows) {
    promptTokens += r.promptTokens;
    completionTokens += r.completionTokens;
    costUsd += r.costUsd;
  }
  return {
    calls: rows.length,
    promptTokens,
    completionTokens,
    costUsd: Math.round(costUsd * 10_000) / 10_000,
  };
}

/** Hosted (server-key) model calls for `userId` since 00:00 UTC; grounded-local runs cost nothing (V2-2). */
export async function countHostedAiCallsToday(db: KanonDb, userId: string): Promise<number> {
  const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const res = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ai_usage
    WHERE user_id = ${userId} AND key_source = 'hosted'
      AND provider <> 'grounded-local'
      AND created_at >= ${startOfDay}::timestamptz
  `);
  const row = (Array.isArray(res) ? res : res.rows)[0] as { n?: unknown } | undefined;
  return Number(row?.n ?? 0);
}
