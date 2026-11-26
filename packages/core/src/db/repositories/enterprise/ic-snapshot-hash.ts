import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import {
  hypothesesTable,
  modelVersionsTable,
  secFilingsCacheTable,
  thesesTable,
  valuationScenariosTable,
} from "../../schema";

export interface ServerThesisSnapshot {
  orgId: string | null;
  snapshotHash: string;
}

/**
 * Computes a deterministic server-side SHA-256 snapshot hash of the thesis state
 * (conviction, price, hypotheses, valuation, latest model version, latest SEC accession)
 * and derives the authoritative `orgId` from `theses.org_id`.
 */
async function loadThesisSnapshotComponents(db: KanonDb, thesisId: string, ticker: string) {
  const [hyps, [val], [latestModel], [sec]] = await Promise.all([
    db
      .select({
        id: hypothesesTable.id,
        title: hypothesesTable.title,
        status: hypothesesTable.status,
        threshold: hypothesesTable.threshold,
      })
      .from(hypothesesTable)
      .where(eq(hypothesesTable.thesisId, thesisId)),
    db
      .select({
        bearEps: valuationScenariosTable.bearEps,
        bearPe: valuationScenariosTable.bearPe,
        baseEps: valuationScenariosTable.baseEps,
        basePe: valuationScenariosTable.basePe,
        bullEps: valuationScenariosTable.bullEps,
        bullPe: valuationScenariosTable.bullPe,
        modelMode: valuationScenariosTable.modelMode,
      })
      .from(valuationScenariosTable)
      .where(eq(valuationScenariosTable.thesisId, thesisId))
      .limit(1),
    db
      .select({ id: modelVersionsTable.id, versionNum: modelVersionsTable.versionNum })
      .from(modelVersionsTable)
      .where(eq(modelVersionsTable.thesisId, thesisId))
      .orderBy(desc(modelVersionsTable.versionNum))
      .limit(1),
    db
      .select({ filings: secFilingsCacheTable.filings })
      .from(secFilingsCacheTable)
      .where(eq(secFilingsCacheTable.ticker, ticker))
      .limit(1),
  ]);
  return {
    hypotheses: [...hyps].sort((a, b) => a.id.localeCompare(b.id)),
    valuation: val ?? null,
    latestModelVersionId: latestModel?.id ?? null,
    latestSecAccession: sec?.filings?.[0]?.accessionNumber ?? null,
  };
}

export async function buildServerThesisSnapshot(
  db: KanonDb,
  thesisId: string,
): Promise<ServerThesisSnapshot | null> {
  const [thesis] = await db
    .select({
      id: thesesTable.id,
      orgId: thesesTable.orgId,
      ticker: thesesTable.ticker,
      currentPrice: thesesTable.currentPrice,
      horizonYears: thesesTable.horizonYears,
      convictionSummary: thesesTable.convictionSummary,
      status: thesesTable.status,
      portfolioRole: thesesTable.portfolioRole,
      targetMaxWeightPct: thesesTable.targetMaxWeightPct,
    })
    .from(thesesTable)
    .where(eq(thesesTable.id, thesisId))
    .limit(1);
  if (!thesis) return null;
  const parts = await loadThesisSnapshotComponents(db, thesisId, thesis.ticker);
  const canonical = JSON.stringify({ thesis, ...parts });
  return {
    orgId: thesis.orgId ?? null,
    snapshotHash: crypto.createHash("sha256").update(canonical).digest("hex"),
  };
}
