import { roundTo } from "./valuation-scenarios";

export interface SensitivityCell {
  eps: number;
  pe: number;
  targetPrice: number;
  returnPct: number;
  cagrPct: number;
  zone: "margin" | "balanced" | "risk";
}

export interface SensitivityMatrix {
  epsSteps: number[];
  peSteps: number[];
  rows: SensitivityCell[][];
}

function buildSteps(low: number, mid: number, high: number, decimals: number): number[] {
  const floor = decimals === 0 ? 1 : 0.05;
  const stepUnit = decimals === 0 ? 1 : 0.01;
  const cleanLow = Math.max(floor, Number.isFinite(low) ? low : floor);
  const cleanMid = Math.max(floor, Number.isFinite(mid) ? mid : floor);
  const cleanHigh = Math.max(floor, Number.isFinite(high) ? high : floor);
  const safeMid = roundTo(cleanMid, decimals);
  const safeLow = roundTo(Math.max(floor, Math.min(cleanLow, safeMid - stepUnit * 2)), decimals);
  const safeHigh = roundTo(Math.max(cleanHigh, safeMid + stepUnit * 2), decimals);
  const raw = [
    safeLow,
    roundTo((safeLow + safeMid) / 2, decimals),
    safeMid,
    roundTo((safeMid + safeHigh) / 2, decimals),
    safeHigh,
  ];
  return raw.reduce<number[]>((acc, val) => {
    const prev = acc[acc.length - 1];
    acc.push(prev !== undefined && val <= prev ? roundTo(prev + stepUnit, decimals) : val);
    return acc;
  }, []);
}

function classifyCell(returnPct: number): "margin" | "balanced" | "risk" {
  if (returnPct >= 35) return "margin";
  if (returnPct >= 0) return "balanced";
  return "risk";
}

export function calculateSensitivityMatrix(params: {
  currentPrice: number;
  horizonYears: number;
  bearEps: number;
  baseEps: number;
  bullEps: number;
  bearPe: number;
  basePe: number;
  bullPe: number;
}): SensitivityMatrix {
  const safePrice =
    Number.isFinite(params.currentPrice) && params.currentPrice > 0 ? params.currentPrice : 1;
  const years =
    Number.isFinite(params.horizonYears) && params.horizonYears > 0 ? params.horizonYears : 3;
  const epsSteps = buildSteps(params.bearEps, params.baseEps, params.bullEps, 2);
  const peSteps = buildSteps(params.bearPe, params.basePe, params.bullPe, 1);

  const rows = epsSteps.map((eps) =>
    peSteps.map((pe) => {
      const targetPrice = roundTo(eps * pe, 2);
      const returnPct = roundTo(((targetPrice - safePrice) / safePrice) * 100, 1);
      const cagrPct = roundTo(((targetPrice / safePrice) ** (1 / years) - 1) * 100, 1);
      return {
        eps,
        pe,
        targetPrice,
        returnPct,
        cagrPct,
        zone: classifyCell(returnPct),
      };
    }),
  );

  return { epsSteps, peSteps, rows };
}
