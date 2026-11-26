import { roundTo } from "../valuation-scenarios";

export interface DatedCashFlow {
  /** ISO date YYYY-MM-DD. Negative = deposit/investment, Positive = withdrawal/ending NAV. */
  date: string;
  amount: number;
}

export interface BrinsonSectorInput {
  sector: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  portfolioReturn: number;
  benchmarkReturn: number;
}

export interface BrinsonAttributionResult {
  totalActiveReturnPct: number;
  allocationEffectPct: number;
  selectionEffectPct: number;
  interactionEffectPct: number;
  bySector: Array<{
    sector: string;
    allocationPct: number;
    selectionPct: number;
    interactionPct: number;
  }>;
}

/** Time-Weighted Return (TWR %) across sub-period decimal returns (e.g. 0.05 = +5%). */
export function calculateTwrPct(subPeriodReturns: readonly number[]): number | null {
  if (subPeriodReturns.length === 0) return null;
  let acc = 1;
  for (const r of subPeriodReturns) {
    if (!Number.isFinite(r) || r <= -1) return null;
    acc *= 1 + r;
  }
  return roundTo((acc - 1) * 100, 2);
}

function xnpv(rate: number, flows: readonly { years: number; amount: number }[]): number {
  let sum = 0;
  for (const cf of flows) {
    sum += cf.amount / (1 + rate) ** cf.years;
  }
  return sum;
}

function bisectIrr(flows: readonly { years: number; amount: number }[]): number | null {
  let lo = -0.95;
  let hi = 5.0;
  const fLo = xnpv(lo, flows);
  if (fLo * xnpv(hi, flows) > 0) return null;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = xnpv(mid, flows);
    if (Math.abs(fMid) < 1e-7) return roundTo(mid * 100, 2);
    if (fLo * fMid > 0) lo = mid;
    else hi = mid;
  }
  return roundTo(((lo + hi) / 2) * 100, 2);
}

/** Money-Weighted Return (annualized XIRR %) solved via safeguarded bisection. */
export function calculateMwrIrrPct(cashFlows: readonly DatedCashFlow[]): number | null {
  if (cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(sorted[0]?.date ?? "");
  if (!Number.isFinite(t0)) return null;
  const normalized = sorted.map((cf) => ({
    years: (Date.parse(cf.date) - t0) / (365.25 * 24 * 3600 * 1000),
    amount: cf.amount,
  }));
  if (!normalized.some((f) => f.amount < 0) || !normalized.some((f) => f.amount > 0)) return null;
  return bisectIrr(normalized);
}

/** Brinson-Hood-Beebower portfolio attribution vs benchmark (inputs as decimals). */
export function calculateBrinsonAttribution(
  sectors: readonly BrinsonSectorInput[],
): BrinsonAttributionResult {
  let allocTotal = 0;
  let selectTotal = 0;
  let interTotal = 0;
  const bySector = sectors.map((s) => {
    const alloc = (s.portfolioWeight - s.benchmarkWeight) * s.benchmarkReturn;
    const select = s.benchmarkWeight * (s.portfolioReturn - s.benchmarkReturn);
    const inter = (s.portfolioWeight - s.benchmarkWeight) * (s.portfolioReturn - s.benchmarkReturn);
    allocTotal += alloc;
    selectTotal += select;
    interTotal += inter;
    return {
      sector: s.sector,
      allocationPct: roundTo(alloc * 100, 2),
      selectionPct: roundTo(select * 100, 2),
      interactionPct: roundTo(inter * 100, 2),
    };
  });
  return {
    totalActiveReturnPct: roundTo((allocTotal + selectTotal + interTotal) * 100, 2),
    allocationEffectPct: roundTo(allocTotal * 100, 2),
    selectionEffectPct: roundTo(selectTotal * 100, 2),
    interactionEffectPct: roundTo(interTotal * 100, 2),
    bySector,
  };
}
