import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { auditLogTable, membershipsTable, restrictedListTable } from "../../schema";

const AUDIT_CHAIN_LOCK_KEY = 72839104;

async function writeChainedAuditRow(
  tx: KanonDb,
  input: {
    actorUserId: string;
    orgId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`);
  const id = `aud_${crypto.randomUUID()}`;
  const [prev] = await tx
    .select({ entryHash: auditLogTable.entryHash })
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt), desc(auditLogTable.id))
    .limit(1);
  const prevHash = prev?.entryHash ?? "";
  const metadata = input.metadata ?? {};
  const entryHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        prevHash,
        id,
        actorUserId: input.actorUserId,
        orgId: input.orgId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata,
      }),
    )
    .digest("hex");
  await tx.insert(auditLogTable).values({
    id,
    actorUserId: input.actorUserId,
    orgId: input.orgId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadataJson: metadata,
    prevHash,
    entryHash,
  });
  return id;
}

export async function appendAuditLog(
  db: KanonDb,
  input: {
    actorUserId: string;
    orgId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  return runInTransaction(db, (tx) => writeChainedAuditRow(tx, input));
}

export async function listAuditLogs(db: KanonDb, actorUserId: string, limit = 50) {
  return db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.actorUserId, actorUserId))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit);
}

export async function addRestrictedTicker(
  db: KanonDb,
  input: {
    orgId: string;
    ticker: string;
    reason: string;
    addedBy: string;
    expiresAt?: Date | null;
  },
) {
  const ticker = input.ticker.trim().toUpperCase();
  const id = `rst_${crypto.randomUUID()}`;
  await runInTransaction(db, async (tx) => {
    await tx
      .insert(restrictedListTable)
      .values({
        id,
        orgId: input.orgId,
        ticker,
        reason: input.reason.trim(),
        addedBy: input.addedBy,
        expiresAt: input.expiresAt ?? null,
      })
      .onConflictDoUpdate({
        target: [restrictedListTable.orgId, restrictedListTable.ticker],
        set: { reason: input.reason.trim(), expiresAt: input.expiresAt ?? null },
      });
    await appendAuditLog(tx, {
      actorUserId: input.addedBy,
      orgId: input.orgId,
      action: "compliance.restrict_ticker",
      targetType: "restricted_list",
      targetId: ticker,
      metadata: { reason: input.reason.trim() },
    });
  });
  return { id, ticker };
}

export async function isTickerRestricted(
  db: KanonDb,
  orgId: string,
  ticker: string,
  now = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(restrictedListTable)
    .where(
      and(
        eq(restrictedListTable.orgId, orgId),
        eq(restrictedListTable.ticker, ticker.trim().toUpperCase()),
      ),
    )
    .limit(1);
  if (!row) return false;
  return !row.expiresAt || row.expiresAt.getTime() >= now.getTime();
}

export async function isTickerRestrictedForUser(
  db: KanonDb,
  userId: string,
  ticker: string,
  now = new Date(),
): Promise<boolean> {
  const orgRows = await db
    .select({ orgId: membershipsTable.orgId })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, userId));
  if (orgRows.length === 0) return false;
  const rows = await db
    .select({ expiresAt: restrictedListTable.expiresAt })
    .from(restrictedListTable)
    .where(
      and(
        inArray(
          restrictedListTable.orgId,
          orgRows.map((o) => o.orgId),
        ),
        eq(restrictedListTable.ticker, ticker.trim().toUpperCase()),
      ),
    );
  return rows.some((r) => !r.expiresAt || r.expiresAt.getTime() >= now.getTime());
}

export async function listRestrictedTickers(db: KanonDb, orgId: string) {
  return db
    .select()
    .from(restrictedListTable)
    .where(eq(restrictedListTable.orgId, orgId))
    .orderBy(desc(restrictedListTable.createdAt));
}
