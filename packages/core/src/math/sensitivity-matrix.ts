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
  const safeLow = Math.max(0.5, low);
  const safeHigh = Math.max(safeLow + 1, high);
  const lowMid = roundTo((safeLow + mid) / 2, decimals);
  const highMid = roundTo((mid + safeHigh) / 2, decimals);
  return [
    roundTo(safeLow, decimals),
    lowMid,
    roundTo(mid, decimals),
    highMid,
    roundTo(safeHigh, decimals),
  ];
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
  const safePrice = params.currentPrice > 0 ? params.currentPrice : 1;
  const years = params.horizonYears > 0 ? params.horizonYears : 3;
  const epsSteps = buildSteps(params.bearEps, params.baseEps, params.bullEps, 2);
  const peSteps = buildSteps(params.bearPe, params.basePe, params.bullPe, 0);

  const rows = epsSteps.map((eps) =>
    peSteps.map((pe) => {
      const targetPrice = roundTo(eps * pe, 1);
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
