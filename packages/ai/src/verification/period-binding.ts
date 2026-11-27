export interface PeriodTag {
  fy: number | null;
  fp: "FY" | "Q1" | "Q2" | "Q3" | "Q4" | null;
}

const CN_QUARTER: Record<string, "Q1" | "Q2" | "Q3" | "Q4"> = {
  "1": "Q1",
  "2": "Q2",
  "3": "Q3",
  "4": "Q4",
  一: "Q1",
  二: "Q2",
  三: "Q3",
  四: "Q4",
};

function parseYearFromSlice(slice: string): number | null {
  const fyMatch = /\bFY\s*(\d{2,4})\b|(\d{4})\s*财年/i.exec(slice);
  const rawYr = fyMatch?.[1] ?? fyMatch?.[2];
  if (!rawYr) return null;
  const yr = Number(rawYr);
  return yr < 100 ? 2000 + yr : yr;
}

function parseQuarterFromSlice(slice: string, fy: number | null): PeriodTag["fp"] {
  const qMatch = /\b(Q[1-4])\b|第([1-4一二三四])季度/i.exec(slice);
  if (qMatch?.[1]) return qMatch[1].toUpperCase() as "Q1" | "Q2" | "Q3" | "Q4";
  if (qMatch?.[2]) return CN_QUARTER[qMatch[2]] ?? null;
  return fy !== null ? "FY" : null;
}

/** Parses nearest fiscal year / quarter tag within ±40 chars around a numeric claim (R4). */
export function parseNearbyPeriod(text: string, index: number): PeriodTag | null {
  const slice = text.slice(Math.max(0, index - 40), Math.min(text.length, index + 40));
  const fy = parseYearFromSlice(slice);
  const fp = parseQuarterFromSlice(slice, fy);
  return fy === null && fp === null ? null : { fy, fp };
}

export function periodsCompatible(
  claimPeriod: PeriodTag | null,
  evidencePeriod: PeriodTag | null,
): boolean {
  if (!claimPeriod || !evidencePeriod) return true;
  if (
    claimPeriod.fy !== null &&
    evidencePeriod.fy !== null &&
    claimPeriod.fy !== evidencePeriod.fy
  ) {
    return false;
  }
  if (
    claimPeriod.fp !== null &&
    evidencePeriod.fp !== null &&
    claimPeriod.fp !== "FY" &&
    evidencePeriod.fp !== "FY" &&
    claimPeriod.fp !== evidencePeriod.fp
  ) {
    return false;
  }
  return true;
}
