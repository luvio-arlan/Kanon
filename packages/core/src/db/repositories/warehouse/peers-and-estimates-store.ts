import crypto from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import {
  type EstimateMetric,
  estimatesSnapshotsTable,
  type ThesisPeerRole,
  thesisPeersTable,
} from "../../schema";

export interface ThesisPeerRecord {
  id: string;
  thesisId: string;
  ticker: string;
  role: ThesisPeerRole;
  addedBy: string;
}

export async function listThesisPeers(db: KanonDb, thesisId: string): Promise<ThesisPeerRecord[]> {
  return db
    .select({
      id: thesisPeersTable.id,
      thesisId: thesisPeersTable.thesisId,
      ticker: thesisPeersTable.ticker,
      role: thesisPeersTable.role,
      addedBy: thesisPeersTable.addedBy,
    })
    .from(thesisPeersTable)
    .where(eq(thesisPeersTable.thesisId, thesisId))
    .orderBy(asc(thesisPeersTable.createdAt));
}

export async function upsertThesisPeer(
  db: KanonDb,
  input: { thesisId: string; ticker: string; role?: ThesisPeerRole; addedBy?: string },
): Promise<ThesisPeerRecord> {
  const ticker = input.ticker.trim().toUpperCase();
  const id = `peer_${crypto.randomUUID()}`;
  await db
    .insert(thesisPeersTable)
    .values({
      id,
      thesisId: input.thesisId,
      ticker,
      role: input.role ?? "peer",
      addedBy: input.addedBy ?? "user",
    })
    .onConflictDoUpdate({
      target: [thesisPeersTable.thesisId, thesisPeersTable.ticker],
      set: { role: input.role ?? "peer" },
    });
  const [row] = await db
    .select()
    .from(thesisPeersTable)
    .where(and(eq(thesisPeersTable.thesisId, input.thesisId), eq(thesisPeersTable.ticker, ticker)))
    .limit(1);
  if (!row) throw new Error(`Failed to persist peer ${ticker}`);
  return row;
}

export async function removeThesisPeer(
  db: KanonDb,
  thesisId: string,
  ticker: string,
): Promise<boolean> {
  const deleted = await db
    .delete(thesisPeersTable)
    .where(
      and(
        eq(thesisPeersTable.thesisId, thesisId),
        eq(thesisPeersTable.ticker, ticker.trim().toUpperCase()),
      ),
    )
    .returning();
  return deleted.length > 0;
}

export async function recordEstimateSnapshot(
  db: KanonDb,
  input: {
    id?: string;
    securityId: string;
    provider: string;
    metric: EstimateMetric;
    fiscalPeriod: string;
    mean: number | null;
    median?: number | null;
    high?: number | null;
    low?: number | null;
    analystCount?: number | null;
    asOf: string;
  },
): Promise<void> {
  await db
    .insert(estimatesSnapshotsTable)
    .values({
      id: input.id ?? `est_${crypto.randomUUID()}`,
      securityId: input.securityId,
      provider: input.provider,
      metric: input.metric,
      fiscalPeriod: input.fiscalPeriod,
      mean: input.mean,
      median: input.median ?? null,
      high: input.high ?? null,
      low: input.low ?? null,
      analystCount: input.analystCount ?? null,
      asOf: input.asOf,
    })
    .onConflictDoNothing();
}

export async function computeEstimateRevisionTrend(
  db: KanonDb,
  params: { securityId: string; metric: EstimateMetric; fiscalPeriod: string },
): Promise<"up" | "flat" | "down" | "unknown"> {
  const rows = await db
    .select({ mean: estimatesSnapshotsTable.mean, asOf: estimatesSnapshotsTable.asOf })
    .from(estimatesSnapshotsTable)
    .where(
      and(
        eq(estimatesSnapshotsTable.securityId, params.securityId),
        eq(estimatesSnapshotsTable.metric, params.metric),
        eq(estimatesSnapshotsTable.fiscalPeriod, params.fiscalPeriod),
      ),
    )
    .orderBy(desc(estimatesSnapshotsTable.asOf))
    .limit(2);
  const latest = rows[0]?.mean;
  const prior = rows[1]?.mean;
  if (
    latest === null ||
    latest === undefined ||
    prior === null ||
    prior === undefined ||
    prior === 0
  )
    return "unknown";
  const pctChange = ((latest - prior) / Math.abs(prior)) * 100;
  if (pctChange >= 1.5) return "up";
  if (pctChange <= -1.5) return "down";
  return "flat";
}
