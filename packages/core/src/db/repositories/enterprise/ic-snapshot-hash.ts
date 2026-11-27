import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import {
  crossChecksTable,
  disciplineEntriesTable,
  hypothesesTable,
  modelVersionsTable,
  thesesTable,
  thesisCatalystsTable,
  valuationScenariosTable,
} from "../../schema";

export interface ServerThesisSnapshot {
  orgId: string | null;
  snapshotHash: string;
}

/**
 * Computes a deterministic server-side SHA-256 snapshot hash strictly from research judgments
 * (conviction, pre-mortem, sizing, hypotheses, catalysts, cross-checks, valuation scenarios,
 * latest exit rule, latest model version) — excluding live market price noise and SEC accession.
 */
async function loadThesisEvidenceParts(db: KanonDb, thesisId: string) {
  const [hyps, cats, checks] = await Promise.all([
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
        id: thesisCatalystsTable.id,
        title: thesisCatalystsTable.title,
        dateLabel: thesisCatalystsTable.dateLabel,
        direction: thesisCatalystsTable.direction,
        status: thesisCatalystsTable.status,
      })
      .from(thesisCatalystsTable)
      .where(eq(thesisCatalystsTable.thesisId, thesisId)),
    db
      .select({
        id: crossChecksTable.id,
        peerCompany: crossChecksTable.peerCompany,
        topic: crossChecksTable.topic,
        alignment: crossChecksTable.alignment,
        takeaway: crossChecksTable.takeaway,
      })
      .from(crossChecksTable)
      .where(eq(crossChecksTable.thesisId, thesisId)),
  ]);
  return {
    hypotheses: [...hyps].sort((a, b) => a.id.localeCompare(b.id)),
    catalysts: [...cats].sort((a, b) => a.id.localeCompare(b.id)),
    crossChecks: [...checks].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function loadThesisValuationParts(db: KanonDb, thesisId: string) {
  const [[val], [latestModel], [latestDisc]] = await Promise.all([
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
      .select({ exitRule: disciplineEntriesTable.exitRule })
      .from(disciplineEntriesTable)
      .where(eq(disciplineEntriesTable.thesisId, thesisId))
      .orderBy(desc(disciplineEntriesTable.createdAt))
      .limit(1),
  ]);
  return {
    valuation: val ?? null,
    latestModelVersionId: latestModel?.id ?? null,
    latestExitRule: latestDisc?.exitRule ?? null,
  };
}

async function loadThesisSnapshotComponents(db: KanonDb, thesisId: string) {
  const [evidence, valuation] = await Promise.all([
    loadThesisEvidenceParts(db, thesisId),
    loadThesisValuationParts(db, thesisId),
  ]);
  return { ...evidence, ...valuation };
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
      horizonYears: thesesTable.horizonYears,
      convictionSummary: thesesTable.convictionSummary,
      status: thesesTable.status,
      portfolioRole: thesesTable.portfolioRole,
      targetMaxWeightPct: thesesTable.targetMaxWeightPct,
      businessFilter: thesesTable.businessFilter,
    })
    .from(thesesTable)
    .where(eq(thesesTable.id, thesisId))
    .limit(1);
  if (!thesis) return null;
  const parts = await loadThesisSnapshotComponents(db, thesisId);
  const canonical = JSON.stringify({
    thesis: {
      id: thesis.id,
      orgId: thesis.orgId ?? null,
      ticker: thesis.ticker,
      horizonYears: thesis.horizonYears,
      convictionSummary: thesis.convictionSummary,
      status: thesis.status,
      portfolioRole: thesis.portfolioRole,
      targetMaxWeightPct: thesis.targetMaxWeightPct,
      preMortem: thesis.businessFilter.preMortem ?? "",
      variantPerception: thesis.businessFilter.variantPerception ?? "",
    },
    ...parts,
  });
  return {
    orgId: thesis.orgId ?? null,
    snapshotHash: crypto.createHash("sha256").update(canonical).digest("hex"),
  };
}
