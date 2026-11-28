import crypto from "node:crypto";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { normalizeCanonicalTicker } from "../../../schemas/research";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import {
  auditLogTable,
  membershipsTable,
  restrictedListTable,
  securitiesTable,
} from "../../schema";

export { normalizeCanonicalTicker };

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
  // Global tail via definer: tenant RLS on audit_log must never fork the hash chain (Stage 6b).
  const tailRes = await tx.execute(sql`SELECT kanon_audit_chain_tail() AS h`);
  const tailRow = (Array.isArray(tailRes) ? tailRes : tailRes.rows)[0] as
    | { h?: unknown }
    | undefined;
  const prevHash = typeof tailRow?.h === "string" ? tailRow.h : "";
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
  const auditOrgs = await db
    .select({ orgId: membershipsTable.orgId })
    .from(membershipsTable)
    .where(
      and(
        eq(membershipsTable.userId, actorUserId),
        isNotNull(membershipsTable.acceptedAt),
        inArray(membershipsTable.role, ["owner", "pm", "compliance"]),
      ),
    );
  const orgIds = auditOrgs.map((r) => r.orgId);
  const where =
    orgIds.length > 0
      ? or(eq(auditLogTable.actorUserId, actorUserId), inArray(auditLogTable.orgId, orgIds))
      : eq(auditLogTable.actorUserId, actorUserId);
  return db
    .select()
    .from(auditLogTable)
    .where(where)
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
  const ticker = normalizeCanonicalTicker(input.ticker);
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

async function resolveEquivalentTickers(db: KanonDb, rawTicker: string): Promise<string[]> {
  const upper = rawTicker.trim().toUpperCase();
  const canonical = normalizeCanonicalTicker(upper);
  const dotted = canonical.replace(/-/g, ".");
  const candidates = new Set([upper, canonical, dotted]);
  const secRows = await db
    .select({ cik: securitiesTable.cik })
    .from(securitiesTable)
    .where(inArray(securitiesTable.ticker, [...candidates]));
  const ciks = [...new Set(secRows.map((r) => r.cik).filter((c): c is string => Boolean(c)))];
  if (ciks.length > 0) {
    const siblings = await db
      .select({ ticker: securitiesTable.ticker })
      .from(securitiesTable)
      .where(inArray(securitiesTable.cik, ciks));
    for (const s of siblings) {
      candidates.add(s.ticker.toUpperCase());
      candidates.add(normalizeCanonicalTicker(s.ticker));
    }
  }
  return [...candidates];
}

export async function isTickerRestricted(
  db: KanonDb,
  orgId: string,
  ticker: string,
  now = new Date(),
): Promise<boolean> {
  const tickers = await resolveEquivalentTickers(db, ticker);
  const rows = await db
    .select({ expiresAt: restrictedListTable.expiresAt })
    .from(restrictedListTable)
    .where(and(eq(restrictedListTable.orgId, orgId), inArray(restrictedListTable.ticker, tickers)));
  return rows.some((r) => !r.expiresAt || r.expiresAt.getTime() >= now.getTime());
}

export async function listRestrictedTickers(db: KanonDb, orgId: string) {
  return db
    .select()
    .from(restrictedListTable)
    .where(eq(restrictedListTable.orgId, orgId))
    .orderBy(desc(restrictedListTable.createdAt));
}
