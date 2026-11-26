import { roundTo } from "../valuation-scenarios";

export interface MauboussinCapInput {
  /** Target market enterprise value (or price per share if baseNopat is per share). */
  currentValue: number;
  /** Trailing NOPAT (or earnings/FCF per share in the same unit as currentValue). */
  baseNopat: number;
  /** Expected annual NOPAT growth rate during the Competitive Advantage Period (%). */
  growthRatePct: number;
  /** Return on Incremental Invested Capital during CAP (%). */
  ronicPct: number;
  /** Cost of capital / hurdle rate (%). */
  waccPct: number;
  maxCapYears?: number;
}

export interface MauboussinCapResult {
  impliedCapYears: number;
  steadyStateValue: number;
  pvOfGrowthOptions: number;
  pvgoSharePct: number;
  exceedsMaxCap: boolean;
}

/**
 * Evaluates Enterprise Value under Mauboussin's Competitive Advantage Period (CAP) model
 * for `T` years of value-creating reinvestment (RONIC > WACC), followed by steady-state
 * zero-NPV growth (terminal value = NOPAT_{T+1} / WACC).
 */
export function evaluateValueAtCapYears(
  baseNopat: number,
  g: number,
  ronic: number,
  wacc: number,
  capYears: number,
): number {
  const whole = Math.floor(capYears);
  const frac = capYears - whole;
  const reinvestRate = g > 0 && ronic > 0 ? Math.min(0.95, g / ronic) : 0;

  let pv = 0;
  let nopat = baseNopat;
  for (let t = 1; t <= whole; t += 1) {
    nopat *= 1 + g;
    pv += (nopat * (1 - reinvestRate)) / (1 + wacc) ** t;
  }
  if (frac > 1e-6) {
    const nextNopat = nopat * (1 + g) ** frac;
    pv += (nextNopat * (1 - reinvestRate) * frac) / (1 + wacc) ** (whole + frac);
    nopat = nextNopat;
  }
  const terminalVal = nopat / wacc;
  return pv + terminalVal / (1 + wacc) ** capYears;
}

/**
 * Solves Mauboussin's implied Competitive Advantage Period (Market-Implied CAP in years)
 * via exact monotone bisection on `evaluateValueAtCapYears`.
 */
export function solveMauboussinImpliedCap(input: MauboussinCapInput): MauboussinCapResult {
  const wacc = Math.max(0.02, input.waccPct / 100);
  const g = input.growthRatePct / 100;
  const ronic = Math.max(0.01, input.ronicPct / 100);
  const maxYears = Math.max(5, Math.min(40, input.maxCapYears ?? 30));

  const steadyStateValue = Math.max(0, input.baseNopat / wacc);
  const pvOfGrowthOptions = input.currentValue - steadyStateValue;
  const pvgoSharePct =
    input.currentValue > 0 ? roundTo((pvOfGrowthOptions / input.currentValue) * 100, 1) : 0;

  if (pvOfGrowthOptions <= 0 || g <= 0 || ronic <= wacc) {
    return {
      impliedCapYears: 0,
      steadyStateValue: roundTo(steadyStateValue, 2),
      pvOfGrowthOptions: roundTo(pvOfGrowthOptions, 2),
      pvgoSharePct,
      exceedsMaxCap: false,
    };
  }

  const maxVal = evaluateValueAtCapYears(input.baseNopat, g, ronic, wacc, maxYears);
  if (maxVal < input.currentValue) {
    return {
      impliedCapYears: maxYears,
      steadyStateValue: roundTo(steadyStateValue, 2),
      pvOfGrowthOptions: roundTo(pvOfGrowthOptions, 2),
      pvgoSharePct,
      exceedsMaxCap: true,
    };
  }

  let lo = 0;
  let hi = maxYears;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (evaluateValueAtCapYears(input.baseNopat, g, ronic, wacc, mid) < input.currentValue) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return {
    impliedCapYears: roundTo((lo + hi) / 2, 1),
    steadyStateValue: roundTo(steadyStateValue, 2),
    pvOfGrowthOptions: roundTo(pvOfGrowthOptions, 2),
    pvgoSharePct,
    exceedsMaxCap: false,
  };
}
