import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { GuidanceFiscalPeriod, GuidanceMetric } from "../../../contracts/intel";
import {
  type BoundPeriodFact,
  bindPeriodFact,
  bindQ4DerivedFact,
  computeGuidanceEpsSplitFactor,
  type PitFactCandidate,
  scoreGuidanceOutcome,
} from "../../../math/guidance";
import type { SplitActionInput } from "../../../math/performance";
import type { KanonDb } from "../../bootstrap";
import { corporateActionsTable, financialFactsTable, guidanceCommitmentsTable } from "../../schema";

type GuidanceRow = typeof guidanceCommitmentsTable.$inferSelect;

const BASIS_REQUIRED_METRICS = new Set<GuidanceMetric>([
  "diluted_eps",
  "gross_margin",
  "operating_margin",
]);

function bindConcept(
  facts: readonly PitFactCandidate[],
  concept: string,
  fy: number,
  fp: GuidanceFiscalPeriod,
): BoundPeriodFact | null {
  return fp === "Q4"
    ? bindQ4DerivedFact({ facts, concept, targetFiscalYear: fy })
    : bindPeriodFact({ facts, concept, targetFiscalYear: fy, targetFiscalPeriod: fp });
}

function computeMarginMetric(
  numeratorConcept: "gross_profit" | "operating_income",
  facts: readonly PitFactCandidate[],
  fy: number,
  fp: GuidanceFiscalPeriod,
): BoundPeriodFact | null {
  const num = bindConcept(facts, numeratorConcept, fy, fp);
  const rev = bindConcept(facts, "revenue", fy, fp);
  if (!num || !rev || rev.value <= 0) return null;
  return { ...num, value: (num.value / rev.value) * 100, restated: num.restated || rev.restated };
}

function computeFcfMetric(
  facts: readonly PitFactCandidate[],
  fy: number,
  fp: GuidanceFiscalPeriod,
): BoundPeriodFact | null {
  const cfo = bindConcept(facts, "operating_cash_flow", fy, fp);
  const cap = bindConcept(facts, "capex", fy, fp);
  if (!cfo || !cap) return null;
  return { ...cfo, value: cfo.value - Math.abs(cap.value), restated: cfo.restated || cap.restated };
}

function computeBoundMetric(
  metric: GuidanceMetric,
  facts: readonly PitFactCandidate[],
  fy: number,
  fp: GuidanceFiscalPeriod,
): BoundPeriodFact | null {
  if (metric === "gross_margin") return computeMarginMetric("gross_profit", facts, fy, fp);
  if (metric === "operating_margin") return computeMarginMetric("operating_income", facts, fy, fp);
  if (metric === "free_cash_flow") return computeFcfMetric(facts, fy, fp);
  if (metric !== "revenue" && metric !== "diluted_eps" && metric !== "capex") return null;
  const bound = bindConcept(facts, metric, fy, fp);
  if (!bound) return null;
  return metric === "capex" ? { ...bound, value: Math.abs(bound.value) } : bound;
}

async function markRowUnresolvable(
  db: KanonDb,
  row: GuidanceRow,
  reason: string,
): Promise<boolean> {
  await db
    .update(guidanceCommitmentsTable)
    .set({
      outcome: "unresolvable",
      actualSourceJson: { kind: "unresolvable", reason },
      resolvedAt: new Date(),
      resolutionVersion: "pit/2",
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

async function fetchSecurityFactsAndSplits(
  db: KanonDb,
  securityId: string,
  fy: number,
  needSplits: boolean,
): Promise<{ facts: PitFactCandidate[]; splits: SplitActionInput[] }> {
  const [facts, splitRows] = await Promise.all([
    db
      .select({
        accession: financialFactsTable.accession,
        concept: financialFactsTable.concept,
        duration: financialFactsTable.duration,
        fiscalYear: financialFactsTable.fiscalYear,
        fiscalPeriod: financialFactsTable.fiscalPeriod,
        periodStart: financialFactsTable.periodStart,
        periodEnd: financialFactsTable.periodEnd,
        filedAt: financialFactsTable.filedAt,
        value: financialFactsTable.value,
      })
      .from(financialFactsTable)
      .where(
        and(eq(financialFactsTable.securityId, securityId), eq(financialFactsTable.fiscalYear, fy)),
      )
      .orderBy(asc(financialFactsTable.filedAt)),
    needSplits
      ? db
          .select({ exDate: corporateActionsTable.exDate, ratio: corporateActionsTable.ratio })
          .from(corporateActionsTable)
          .where(
            and(
              eq(corporateActionsTable.securityId, securityId),
              eq(corporateActionsTable.kind, "split"),
            ),
          )
      : Promise.resolve([]),
  ]);
  const splits = splitRows.flatMap((s) =>
    typeof s.ratio === "number" && s.ratio > 0 ? [{ exDate: s.exDate, ratio: s.ratio }] : [],
  );
  return { facts, splits };
}

function getUnresolvableReason(row: GuidanceRow): string | null {
  if (row.metric === "custom" || row.metric === "operating_expenses") return "concept_unavailable";
  if (row.basis === "non_gaap") return "non_gaap_basis";
  if (BASIS_REQUIRED_METRICS.has(row.metric) && row.basis === "unspecified") {
    return "basis_unspecified";
  }
  return null;
}

function missingConceptReason(row: GuidanceRow, facts: readonly PitFactCandidate[]): string | null {
  const hasFy = facts.some((f) => f.duration === "annual" && f.fiscalPeriod === "FY");
  if (!hasFy) return null;
  if (row.targetFiscalPeriod === "Q4") return "q4_unavailable";
  if (row.metric === "operating_margin") return "concept_unavailable";
  return null;
}

async function persistResolvedGuidance(
  db: KanonDb,
  row: GuidanceRow,
  bound: BoundPeriodFact,
  splitFactor: number,
) {
  const scored = scoreGuidanceOutcome({
    metric: row.metric,
    unit: row.unit as NonNullable<GuidanceRow["unit"]>,
    low: row.low !== null ? row.low / splitFactor : null,
    high: row.high !== null ? row.high / splitFactor : null,
    actual: bound.value,
  });
  await db
    .update(guidanceCommitmentsTable)
    .set({
      targetPeriodEnd: bound.periodEnd,
      actualValue: bound.value,
      actualSourceJson: {
        kind: "pit_fact",
        accession: bound.accession,
        periodEnd: bound.periodEnd,
        splitFactor,
        derived: bound.derived,
        restated: bound.restated,
      },
      outcome: scored.outcome,
      surprise: scored.surprise,
      resolvedAt: new Date(),
      resolutionVersion: "pit/2",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guidanceCommitmentsTable.id, row.id),
        eq(guidanceCommitmentsTable.thesisId, row.thesisId),
      ),
    );
}

async function resolveSingleRow(db: KanonDb, row: GuidanceRow): Promise<boolean> {
  if (!row.unit || row.targetFiscalYear === null || !row.targetFiscalPeriod) return false;
  const blocked = getUnresolvableReason(row);
  if (blocked) return markRowUnresolvable(db, row, blocked);
  if (!row.securityId) return false;
  const { facts, splits } = await fetchSecurityFactsAndSplits(
    db,
    row.securityId,
    row.targetFiscalYear,
    row.metric === "diluted_eps",
  );
  const bound = computeBoundMetric(row.metric, facts, row.targetFiscalYear, row.targetFiscalPeriod);
  if (!bound) {
    const missingReason = missingConceptReason(row, facts);
    return missingReason ? markRowUnresolvable(db, row, missingReason) : false;
  }
  const splitFactor =
    row.metric === "diluted_eps"
      ? computeGuidanceEpsSplitFactor(row.issuedOn, bound.filedAt, splits)
      : 1;
  await persistResolvedGuidance(db, row, bound, splitFactor);
  return true;
}

/**
 * System-context daily job resolving both `confirmed` and `superseded` GAAP guidance commitments
 * against earliest-filed current-period PIT SEC facts with EPS split normalization (`pit/2`, U0-6).
 */
export async function resolvePendingGuidanceCommitments(db: KanonDb): Promise<number> {
  const pending = await db
    .select()
    .from(guidanceCommitmentsTable)
    .where(
      and(
        inArray(guidanceCommitmentsTable.status, ["confirmed", "superseded"]),
        isNull(guidanceCommitmentsTable.resolvedAt),
      ),
    );
  let resolvedCount = 0;
  for (const row of pending) {
    if (await resolveSingleRow(db, row)) resolvedCount += 1;
  }
  return resolvedCount;
}
