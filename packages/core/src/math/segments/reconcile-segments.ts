import type { SegmentLine, SegmentReportStatus } from "../../contracts/intel";
import { roundTo } from "../valuation-scenarios";

export interface ReconcileSegmentInput {
  lines: readonly SegmentLine[];
  consolidatedRevenue: number | null;
  consolidatedOperatingIncome: number | null;
  profitIsStandard: boolean;
}

export interface ReconcileSegmentOutput {
  status: SegmentReportStatus;
  segmentRevenueSum: number | null;
  diffPct: number | null;
  profitReconciled: boolean;
  eliminationsMaterial: boolean;
}

function sumNullable(values: readonly (number | null)[]): number | null {
  let has = false;
  let total = 0;
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) {
      has = true;
      total += v;
    }
  }
  return has ? total : null;
}

function checkProfitReconciliation(
  lines: readonly SegmentLine[],
  consRev: number,
  consOi: number | null,
  profitIsStandard: boolean,
): boolean {
  if (!profitIsStandard || consOi === null || !Number.isFinite(consOi)) return false;
  const relevant = lines.filter((l) => l.kind !== "elimination");
  const sumOi = sumNullable(relevant.map((l) => l.operatingIncome));
  if (sumOi === null) return false;
  const denom = Math.max(Math.abs(consOi), 0.01 * Math.abs(consRev), 1);
  return Math.abs(sumOi - consOi) / denom <= 0.01;
}

function buildEarlyReconcile(
  status: SegmentReportStatus,
  segmentRevenueSum: number | null,
): ReconcileSegmentOutput {
  return {
    status,
    segmentRevenueSum,
    diffPct: null,
    profitReconciled: false,
    eliminationsMaterial: false,
  };
}

/** Deterministic revenue & operating income reconciliation gate for dimensional SEC segment reports (R2). */
export function reconcileSegmentReport(input: ReconcileSegmentInput): ReconcileSegmentOutput {
  if (input.lines.length === 0) return buildEarlyReconcile("no_dimensional_data", null);
  const segmentLines = input.lines.filter((l) => l.kind === "segment");
  if (segmentLines.length <= 1) {
    return buildEarlyReconcile("single_segment", sumNullable(segmentLines.map((l) => l.revenue)));
  }
  const consRev = input.consolidatedRevenue;
  const allRevSum = sumNullable(input.lines.map((l) => l.revenue));
  if (
    consRev === null ||
    !Number.isFinite(consRev) ||
    Math.abs(consRev) <= 0 ||
    allRevSum === null
  ) {
    return buildEarlyReconcile("unreconciled", allRevSum);
  }
  const diffRatio = Math.abs(allRevSum - consRev) / Math.abs(consRev);
  const status: SegmentReportStatus = diffRatio <= 0.005 ? "reconciled" : "unreconciled";
  const elimRev = Math.abs(
    sumNullable(input.lines.filter((l) => l.kind === "elimination").map((l) => l.revenue)) ?? 0,
  );
  const profitReconciled =
    status === "reconciled" &&
    checkProfitReconciliation(
      input.lines,
      consRev,
      input.consolidatedOperatingIncome,
      input.profitIsStandard,
    );
  return {
    status,
    segmentRevenueSum: roundTo(allRevSum, 2),
    diffPct: roundTo(diffRatio * 100, 3),
    profitReconciled,
    eliminationsMaterial: elimRev >= 0.01 * Math.abs(consRev),
  };
}
