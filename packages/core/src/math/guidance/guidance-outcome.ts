import type { GuidanceMetric, GuidanceOutcome, GuidanceUnit } from "../../contracts/intel";
import { roundTo } from "../valuation-scenarios";

export interface GuidanceScoreInput {
  metric: GuidanceMetric;
  unit: GuidanceUnit;
  low: number | null;
  high: number | null;
  actual: number;
}

export interface GuidanceScoreResult {
  outcome: GuidanceOutcome;
  surprise: number | null;
  midpoint: number;
  tolerance: number;
}

type Direction = "higher" | "lower" | "neutral";

function resolveMetricDirection(metric: GuidanceMetric): Direction {
  if (metric === "operating_expenses") return "lower";
  if (metric === "capex") return "neutral";
  return "higher";
}

function computeTolerance(unit: GuidanceUnit, midpoint: number, isPoint: boolean): number {
  if (unit === "pct") return isPoint ? 0.25 : 0.1;
  const pct = isPoint ? 0.01 : 0.005;
  return Math.abs(midpoint) * pct;
}

function classifyWithDirection(
  actual: number,
  low: number,
  high: number,
  tol: number,
  dir: Direction,
): GuidanceOutcome {
  if (actual > high + tol) {
    if (dir === "higher") return "beat";
    return "miss";
  }
  if (actual < low - tol) {
    if (dir === "lower") return "beat";
    return "miss";
  }
  return "in_line";
}

/** Deterministic single-item management guidance outcome & surprise scorer (R3). */
export function scoreGuidanceOutcome(input: GuidanceScoreInput): GuidanceScoreResult {
  const low = input.low ?? input.high;
  const high = input.high ?? input.low;
  if (low === null || high === null || !Number.isFinite(input.actual)) {
    return { outcome: "unresolvable", surprise: null, midpoint: 0, tolerance: 0 };
  }
  const midpoint = (low + high) / 2;
  const isPoint = Math.abs(high - low) <= 1e-12;
  const tolerance = computeTolerance(input.unit, midpoint, isPoint);
  const direction = resolveMetricDirection(input.metric);
  const outcome = classifyWithDirection(input.actual, low, high, tolerance, direction);
  const surprise =
    input.unit === "pct"
      ? roundTo(input.actual - midpoint, 4)
      : Math.abs(midpoint) > 1e-12
        ? roundTo(((input.actual - midpoint) / Math.abs(midpoint)) * 100, 4)
        : null;
  return { outcome, surprise, midpoint: roundTo(midpoint, 6), tolerance };
}
