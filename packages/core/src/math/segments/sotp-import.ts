import type { SegmentImportBlocker, SegmentLine, SegmentReportStatus } from "../../contracts/intel";
import type { SotpSegment } from "../../schemas/v7-research-os";
import { roundTo } from "../valuation-scenarios";

export interface SotpImportEligibilityInput {
  status: SegmentReportStatus;
  periodKind?: "annual" | "quarter";
  currency: string;
  fxToUsd: number | null;
  profitIsStandard: boolean;
  profitReconciled: boolean;
  eliminationsMaterial: boolean;
  lines: readonly SegmentLine[];
}

export interface SotpImportEligibility {
  revenue: boolean;
  operatingIncome: boolean;
  blockers: SegmentImportBlocker[];
}

function hasFxRate(currency: string, fxToUsd: number | null): boolean {
  return currency === "USD" || (fxToUsd !== null && fxToUsd > 0);
}

export function evaluateSotpImportEligibility(
  input: SotpImportEligibilityInput,
): SotpImportEligibility {
  const blockers: SegmentImportBlocker[] = [];
  const isAnnual = (input.periodKind ?? "annual") === "annual";
  if (!isAnnual) blockers.push("quarterly_period");
  if (input.status === "single_segment") blockers.push("single_segment");
  else if (input.status !== "reconciled") blockers.push("unreconciled");
  const fxOk = hasFxRate(input.currency, input.fxToUsd);
  if (!fxOk) blockers.push("fx_missing");
  if (input.eliminationsMaterial) blockers.push("has_eliminations");
  const profitOk = input.profitIsStandard && input.profitReconciled;
  if (!profitOk) blockers.push("custom_profit_measure");
  const hasNegOi = input.lines.some(
    (l) => l.kind === "segment" && l.operatingIncome !== null && l.operatingIncome <= 0,
  );
  if (hasNegOi) blockers.push("negative_profit_segment");
  const baseOk = isAnnual && input.status === "reconciled" && fxOk;
  return {
    revenue: baseOk && !input.eliminationsMaterial,
    operatingIncome: baseOk && profitOk && !hasNegOi,
    blockers: blockers.slice(0, 7),
  };
}

export interface MapSegmentsToSotpInput {
  accession: string;
  periodEnd: string;
  mode: "revenue" | "operating_income";
  concept: string;
  currency: string;
  fxToUsd: number | null;
  lines: readonly SegmentLine[];
}

function toUsdBillions(raw: number, currency: string, fxToUsd: number | null): number | null {
  const rate = currency === "USD" ? 1 : fxToUsd;
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  return roundTo((raw * rate) / 1e9, 3);
}

function capTopSevenWithOther(
  items: Array<{ line: SegmentLine; valB: number }>,
  accession: string,
  periodEnd: string,
  metricLabel: string,
  concept: string,
): SotpSegment[] {
  const sorted = [...items].sort((a, b) => Math.abs(b.valB) - Math.abs(a.valB));
  const head = sorted.length > 8 ? sorted.slice(0, 7) : sorted;
  const tail = sorted.length > 8 ? sorted.slice(7) : [];
  const mapped: SotpSegment[] = head.map(({ line, valB }, idx) => ({
    id: `sec-seg-${idx + 1}-${line.memberQname.slice(-24)}`,
    name: line.label.slice(0, 60),
    metricLabel,
    metricValueB: valB,
    bearMultiple: null,
    baseMultiple: null,
    bullMultiple: null,
    source: {
      kind: "sec_segment",
      accession,
      periodEnd,
      memberQname: line.memberQname,
      concept,
    },
  }));
  if (tail.length > 0) {
    const tailSum = roundTo(
      tail.reduce((s, item) => s + item.valB, 0),
      3,
    );
    mapped.push({
      id: `sec-seg-other-${periodEnd}`,
      name: `其余 ${tail.length} 个分部合计`,
      metricLabel,
      metricValueB: tailSum,
      bearMultiple: null,
      baseMultiple: null,
      bullMultiple: null,
    });
  }
  return mapped;
}

function isIncludedSegmentLine(line: SegmentLine, mode: "revenue" | "operating_income"): boolean {
  return line.kind === "segment" || (mode === "operating_income" && line.kind === "corporate");
}

function extractLineValueB(
  line: SegmentLine,
  input: MapSegmentsToSotpInput,
): { skip: true } | { abort: true } | { valB: number } {
  if (!isIncludedSegmentLine(line, input.mode)) return { skip: true };
  const raw = input.mode === "revenue" ? line.revenue : line.operatingIncome;
  if (raw === null || !Number.isFinite(raw)) return { skip: true };
  if (input.mode === "operating_income" && line.kind === "segment" && raw <= 0)
    return { abort: true };
  const valB = toUsdBillions(raw, input.currency, input.fxToUsd);
  return valB === null ? { abort: true } : { valB };
}

/** Maps reconciled SEC segment lines to SOTP segments with strictly null multiples (R2). */
export function mapSegmentsToSotp(input: MapSegmentsToSotpInput): SotpSegment[] {
  const metricLabel = input.mode === "revenue" ? "营收" : "EBIT";
  const picked: Array<{ line: SegmentLine; valB: number }> = [];
  for (const line of input.lines) {
    const res = extractLineValueB(line, input);
    if ("abort" in res) return [];
    if ("valB" in res) picked.push({ line, valB: res.valB });
  }
  return capTopSevenWithOther(picked, input.accession, input.periodEnd, metricLabel, input.concept);
}
