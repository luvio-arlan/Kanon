import { and, asc, eq, isNull } from "drizzle-orm";
import type { GuidanceMetric } from "../../../contracts/intel";
import { scoreGuidanceOutcome } from "../../../math/guidance";
import type { KanonDb } from "../../bootstrap";
import { financialFactsTable, guidanceCommitmentsTable } from "../../schema";

type FactRow = typeof financialFactsTable.$inferSelect;
type GuidanceRow = typeof guidanceCommitmentsTable.$inferSelect;

interface PitMetricSnapshot {
  periodEnd: string;
  originalValue: number;
  originalAccession: string;
  restated: boolean;
}

function pickEarliestConcept(rows: readonly FactRow[], concept: string, periodEnd: string) {
  const grp = rows
    .filter((r) => r.concept === concept && r.periodEnd === periodEnd)
    .sort((a, b) => a.filedAt.localeCompare(b.filedAt));
  const first = grp[0];
  if (!first) return null;
  const last = grp[grp.length - 1];
  const relDiff =
    Math.abs((last?.value ?? first.value) - first.value) / Math.max(Math.abs(first.value), 1e-6);
  const restated = Boolean(last && last.accession !== first.accession) && relDiff > 0.005;
  return { val: first.value, acc: first.accession, restated };
}

function computeDerivedMetric(
  metric: "gross_margin" | "free_cash_flow",
  rows: readonly FactRow[],
  periodEnd: string,
): PitMetricSnapshot | null {
  if (metric === "gross_margin") {
    const gp = pickEarliestConcept(rows, "gross_profit", periodEnd);
    const rev = pickEarliestConcept(rows, "revenue", periodEnd);
    if (!gp || !rev || rev.val <= 0) return null;
    return {
      periodEnd,
      originalValue: (gp.val / rev.val) * 100,
      originalAccession: gp.acc,
      restated: gp.restated || rev.restated,
    };
  }
  const cfo = pickEarliestConcept(rows, "operating_cash_flow", periodEnd);
  const cap = pickEarliestConcept(rows, "capex", periodEnd);
  if (!cfo || !cap) return null;
  return {
    periodEnd,
    originalValue: cfo.val - Math.abs(cap.val),
    originalAccession: cfo.acc,
    restated: cfo.restated || cap.restated,
  };
}

function computeMetricFromRows(
  metric: GuidanceMetric,
  rows: readonly FactRow[],
  periodEnd: string,
): PitMetricSnapshot | null {
  if (metric === "gross_margin" || metric === "free_cash_flow") {
    return computeDerivedMetric(metric, rows, periodEnd);
  }
  if (metric !== "revenue" && metric !== "diluted_eps" && metric !== "capex") return null;
  const r = pickEarliestConcept(rows, metric, periodEnd);
  if (!r) return null;
  const originalValue = metric === "capex" ? Math.abs(r.val) : r.val;
  return { periodEnd, originalValue, originalAccession: r.acc, restated: r.restated };
}

async function markRowUnresolvable(db: KanonDb, row: GuidanceRow): Promise<boolean> {
  await db
    .update(guidanceCommitmentsTable)
    .set({
      outcome: "unresolvable",
      resolvedAt: new Date(),
      resolutionVersion: "pit/1",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guidanceCommitmentsTable.id, row.id),
        eq(guidanceCommitmentsTable.thesisId, row.thesisId),
      ),
    );
  return true;
}

async function fetchTargetFacts(db: KanonDb, row: GuidanceRow) {
  if (!row.securityId || row.targetFiscalYear === null || !row.targetFiscalPeriod) return [];
  const duration = row.targetFiscalPeriod === "FY" ? "annual" : "quarter";
  return db
    .select()
    .from(financialFactsTable)
    .where(
      and(
        eq(financialFactsTable.securityId, row.securityId),
        eq(financialFactsTable.duration, duration),
        eq(financialFactsTable.fiscalYear, row.targetFiscalYear),
        eq(financialFactsTable.fiscalPeriod, row.targetFiscalPeriod),
      ),
    )
    .orderBy(asc(financialFactsTable.filedAt));
}

async function resolveSingleRow(db: KanonDb, row: GuidanceRow): Promise<boolean> {
  if (!row.unit || row.targetFiscalYear === null || !row.targetFiscalPeriod) return false;
  if (row.basis === "non_gaap" || row.metric === "custom") return markRowUnresolvable(db, row);
  const facts = await fetchTargetFacts(db, row);
  const targetEnd = facts[0]?.periodEnd;
  const snap = targetEnd ? computeMetricFromRows(row.metric, facts, targetEnd) : null;
  if (!snap) return false;
  const scored = scoreGuidanceOutcome({
    metric: row.metric,
    unit: row.unit,
    low: row.low,
    high: row.high,
    actual: snap.originalValue,
  });
  await db
    .update(guidanceCommitmentsTable)
    .set({
      targetPeriodEnd: snap.periodEnd,
      actualValue: snap.originalValue,
      actualSourceJson: {
        kind: "pit_fact",
        accession: snap.originalAccession,
        restated: snap.restated,
      },
      outcome: scored.outcome,
      surprise: scored.surprise,
      resolvedAt: new Date(),
      resolutionVersion: "pit/1",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guidanceCommitmentsTable.id, row.id),
        eq(guidanceCommitmentsTable.thesisId, row.thesisId),
      ),
    );
  return true;
}

/** System-context daily job resolving confirmed GAAP guidance against earliest-filed PIT SEC facts (R3). */
export async function resolvePendingGuidanceCommitments(db: KanonDb): Promise<number> {
  const pending = await db
    .select()
    .from(guidanceCommitmentsTable)
    .where(
      and(
        eq(guidanceCommitmentsTable.status, "confirmed"),
        isNull(guidanceCommitmentsTable.resolvedAt),
      ),
    );
  let resolvedCount = 0;
  for (const row of pending) {
    if (await resolveSingleRow(db, row)) resolvedCount += 1;
  }
  return resolvedCount;
}
