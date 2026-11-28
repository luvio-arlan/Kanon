import type { GuidanceBasis, GuidanceUnit } from "@kanon/core";
import { extractCnAndEnNumbers } from "../../verification/cn-number-units";

export interface BasisBounds {
  basis: GuidanceBasis;
  low: number;
  high: number;
}

const DUAL_BASIS_RE = /\bGAAP\s+and\s+non-GAAP\b/i;

function unitValues(sentence: string, unit: GuidanceUnit): number[] {
  return extractCnAndEnNumbers(sentence)
    .filter((n) => (unit === "pct" ? n.kind === "pct" : n.kind === "scalar"))
    .map((n) => n.value)
    .filter((v) => Number.isFinite(v) && v > 0 && !(unit !== "pct" && v >= 1990 && v <= 2100));
}

/** `± N%` widens a USD point multiplicatively; `± N basis points` widens a percentage additively. */
function tolerance(sentence: string, unit: GuidanceUnit): (v: number) => [number, number] {
  const pct = sentence.match(/(?:plus\s+or\s+minus|\+\/-|±)\s*(\d+(?:\.\d+)?)\s*%/i);
  const bps = sentence.match(
    /(?:plus\s+or\s+minus|\+\/-|±)\s*(\d+(?:\.\d+)?)\s*(?:basis\s+points|bps)\b/i,
  );
  if (unit !== "pct" && pct?.[1]) {
    const t = Number(pct[1]) / 100;
    if (t > 0 && t < 0.5) return (v) => [v * (1 - t), v * (1 + t)];
  }
  if (unit === "pct" && bps?.[1]) {
    const d = Number(bps[1]) / 100;
    return (v) => [v - d, v + d];
  }
  return (v) => [v, v];
}

function singleRange(values: readonly number[], widen: (v: number) => [number, number]) {
  const [a, b] = values;
  if (a === undefined) return null;
  const [lo1, hi1] = widen(a);
  if (b === undefined) return { low: lo1, high: hi1 };
  const [lo2, hi2] = widen(b);
  return { low: Math.min(lo1, lo2), high: Math.max(hi1, hi2) };
}

function dualBasisBounds(
  sentence: string,
  values: readonly number[],
  widen: (v: number) => [number, number],
): BasisBounds[] | null {
  if (/\brespectively\b/i.test(sentence)) {
    const [g, n] = values;
    if (g === undefined || n === undefined || values.length !== 2) return null;
    const [gLow, gHigh] = widen(g);
    const [nLow, nHigh] = widen(n);
    return [
      { basis: "gaap", low: gLow, high: gHigh },
      { basis: "non_gaap", low: nLow, high: nHigh },
    ];
  }
  const shared = values.length <= 2 ? singleRange(values, widen) : null;
  return shared
    ? [
        { basis: "gaap", ...shared },
        { basis: "non_gaap", ...shared },
      ]
    : null;
}

/**
 * Splits a guidance sentence into per-basis bounds. "GAAP and non-GAAP … A and B, respectively" yields two
 * candidates; a shared range ("between 71.0% and 72.0%") applies to both; anything unpairable is dropped,
 * never merged into one wider range (V1-1 / P1-3).
 */
export function extractBasisBounds(sentence: string, unit: GuidanceUnit): BasisBounds[] | null {
  const values = unitValues(sentence, unit);
  const widen = tolerance(sentence, unit);
  if (DUAL_BASIS_RE.test(sentence)) return dualBasisBounds(sentence, values, widen);
  const range = values.length <= 2 ? singleRange(values, widen) : null;
  if (!range) return null;
  const basis: GuidanceBasis = /\bnon-?gaap\b/i.test(sentence)
    ? "non_gaap"
    : /\bgaap\b/i.test(sentence)
      ? "gaap"
      : "unspecified";
  return [{ basis, ...range }];
}
