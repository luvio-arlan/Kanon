import { and, desc, eq, inArray, lte } from "drizzle-orm";
import type {
  SegmentAxis,
  SegmentLine,
  SegmentReport,
  SegmentReportStatus,
} from "../../../contracts/intel";
import { evaluateSotpImportEligibility } from "../../../math/segments";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { fxRatesDailyTable, segmentLinesTable, segmentReportsTable } from "../../schema";

export interface UpsertSegmentReportInput {
  id: string;
  securityId: string;
  accession: string;
  form: string;
  axis: SegmentAxis;
  axisQname: string;
  periodStart: string;
  periodEnd: string;
  fiscalPeriod?: string | null;
  currency: string;
  revenueConcept: string;
  profitConcept?: string | null;
  profitIsStandard: boolean;
  consolidatedRevenue: number | null;
  segmentRevenueSum: number | null;
  diffPct: number | null;
  status: SegmentReportStatus;
  filedAt: string;
  algoVersion?: string;
}

function buildSegmentReportValues(report: UpsertSegmentReportInput) {
  return {
    id: report.id,
    securityId: report.securityId,
    accession: report.accession,
    form: report.form,
    axis: report.axis,
    axisQname: report.axisQname,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    fiscalPeriod: report.fiscalPeriod ?? null,
    currency: report.currency.toUpperCase(),
    revenueConcept: report.revenueConcept,
    profitConcept: report.profitConcept ?? null,
    profitIsStandard: report.profitIsStandard,
    consolidatedRevenue: report.consolidatedRevenue,
    segmentRevenueSum: report.segmentRevenueSum,
    diffPct: report.diffPct,
    status: report.status,
    filedAt: report.filedAt,
    algoVersion: report.algoVersion ?? "segments/1",
  };
}

export async function upsertSegmentReportWithLines(
  db: KanonDb,
  report: UpsertSegmentReportInput,
  lines: readonly SegmentLine[],
): Promise<void> {
  const values = buildSegmentReportValues(report);
  await runInTransaction(db, async (tx) => {
    await tx
      .insert(segmentReportsTable)
      .values(values)
      .onConflictDoUpdate({
        target: segmentReportsTable.id,
        set: {
          profitConcept: values.profitConcept,
          profitIsStandard: values.profitIsStandard,
          consolidatedRevenue: values.consolidatedRevenue,
          segmentRevenueSum: values.segmentRevenueSum,
          diffPct: values.diffPct,
          status: values.status,
          filedAt: values.filedAt,
          algoVersion: values.algoVersion,
        },
      });
    await tx.delete(segmentLinesTable).where(eq(segmentLinesTable.reportId, report.id));
    if (lines.length === 0) return;
    await tx.insert(segmentLinesTable).values(
      lines.map((l) => ({
        reportId: report.id,
        memberQname: l.memberQname,
        label: l.label,
        labelSource: l.labelSource,
        lineKind: l.kind,
        revenue: l.revenue,
        operatingIncome: l.operatingIncome,
      })),
    );
  });
}

async function lookupFxToUsd(
  db: KanonDb,
  currency: string,
  periodEnd: string,
): Promise<number | null> {
  if (currency.toUpperCase() === "USD") return 1;
  const [row] = await db
    .select({ usdPerUnit: fxRatesDailyTable.usdPerUnit })
    .from(fxRatesDailyTable)
    .where(
      and(
        eq(fxRatesDailyTable.currency, currency.toUpperCase()),
        lte(fxRatesDailyTable.rateDate, periodEnd),
      ),
    )
    .orderBy(desc(fxRatesDailyTable.rateDate))
    .limit(1);
  return row && row.usdPerUnit > 0 ? row.usdPerUnit : null;
}

function toContractLine(r: typeof segmentLinesTable.$inferSelect): SegmentLine {
  return {
    memberQname: r.memberQname,
    label: r.label,
    labelSource: r.labelSource,
    kind: r.lineKind,
    revenue: r.revenue,
    operatingIncome: r.operatingIncome,
  };
}

function checkEliminationsMaterial(lines: readonly SegmentLine[], consRev: number | null): boolean {
  if (consRev === null || Math.abs(consRev) <= 0) return false;
  const elim = Math.abs(
    lines.filter((l) => l.kind === "elimination").reduce((s, l) => s + (l.revenue ?? 0), 0),
  );
  return elim >= 0.01 * Math.abs(consRev);
}

async function hydrateSegmentReport(
  db: KanonDb,
  r: typeof segmentReportsTable.$inferSelect,
  allLines: readonly SegmentLine[],
): Promise<SegmentReport> {
  const fxToUsd = await lookupFxToUsd(db, r.currency, r.periodEnd);
  const importable = evaluateSotpImportEligibility({
    status: r.status,
    currency: r.currency,
    fxToUsd,
    profitIsStandard: r.profitIsStandard,
    profitReconciled: r.profitIsStandard && r.status === "reconciled",
    eliminationsMaterial: checkEliminationsMaterial(allLines, r.consolidatedRevenue),
    lines: allLines,
  });
  return {
    accession: r.accession,
    form: r.form,
    axis: r.axis,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    currency: r.currency,
    fxToUsd,
    status: r.status,
    diffPct: r.diffPct,
    profitIsStandard: r.profitIsStandard,
    lines: r.status === "reconciled" ? [...allLines] : [],
    importable,
  };
}

/** Point-in-time query returning the latest filed segment reports per periodEnd (R2). */
export async function listLatestSegmentReportsBySecurity(
  db: KanonDb,
  params: { securityId: string; axis: SegmentAxis; asOf?: string; limit?: number },
): Promise<SegmentReport[]> {
  const conds = [
    eq(segmentReportsTable.securityId, params.securityId),
    eq(segmentReportsTable.axis, params.axis),
  ];
  if (params.asOf) conds.push(lte(segmentReportsTable.filedAt, params.asOf));
  const rawReports = await db
    .select()
    .from(segmentReportsTable)
    .where(and(...conds))
    .orderBy(desc(segmentReportsTable.periodEnd), desc(segmentReportsTable.filedAt));

  const latestByPeriod = new Map<string, typeof segmentReportsTable.$inferSelect>();
  for (const r of rawReports) {
    if (!latestByPeriod.has(r.periodEnd)) latestByPeriod.set(r.periodEnd, r);
  }
  const picked = [...latestByPeriod.values()].slice(0, params.limit ?? 2);
  if (picked.length === 0) return [];
  const lineRows = await db
    .select()
    .from(segmentLinesTable)
    .where(
      inArray(
        segmentLinesTable.reportId,
        picked.map((p) => p.id),
      ),
    );
  const linesByReport = new Map<string, SegmentLine[]>();
  for (const lr of lineRows) {
    const arr = linesByReport.get(lr.reportId) ?? [];
    arr.push(toContractLine(lr));
    linesByReport.set(lr.reportId, arr);
  }
  return Promise.all(picked.map((r) => hydrateSegmentReport(db, r, linesByReport.get(r.id) ?? [])));
}
