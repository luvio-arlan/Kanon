import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { type DecisionSnapshotPayload, decisionSnapshotsTable } from "../../schema";
import { getThesisById } from "../thesis-queries";

function hashSnapshotPayload(payload: DecisionSnapshotPayload): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/** Locks an immutable decision snapshot atomically inside a buy transaction (S3 / G15). */
export async function lockDecisionSnapshotForBuy(
  tx: KanonDb,
  params: {
    accountId: string;
    transactionId: string;
    userId: string;
    thesisId: string;
    ticker: string;
    tradeDate: string;
  },
): Promise<{ id: string; snapshotHash: string } | null> {
  const thesis = await getThesisById(tx, params.thesisId, params.userId);
  if (!thesis) return null;
  const payload: DecisionSnapshotPayload = {
    thesisId: thesis.id,
    ticker: thesis.ticker,
    convictionSummary: thesis.convictionSummary,
    bearTargetPrice: thesis.valuation.bear.targetPrice,
    baseTargetPrice: thesis.valuation.base.targetPrice,
    bullTargetPrice: thesis.valuation.bull.targetPrice,
    hypotheses: thesis.hypotheses.map((h) => ({
      id: h.id,
      title: h.title,
      status: h.status,
      threshold: h.threshold,
    })),
  };
  const snapshotHash = hashSnapshotPayload(payload);
  const id = `ds_${crypto.randomUUID()}`;
  await tx.insert(decisionSnapshotsTable).values({
    id,
    accountId: params.accountId,
    transactionId: params.transactionId,
    userId: params.userId,
    thesisId: thesis.id,
    ticker: params.ticker.trim().toUpperCase(),
    tradeDate: params.tradeDate,
    snapshotHash,
    payloadJson: payload,
  });
  return { id, snapshotHash };
}

export async function listDecisionSnapshotsByUser(tx: KanonDb, userId: string) {
  return tx
    .select()
    .from(decisionSnapshotsTable)
    .where(eq(decisionSnapshotsTable.userId, userId))
    .orderBy(desc(decisionSnapshotsTable.createdAt));
}
