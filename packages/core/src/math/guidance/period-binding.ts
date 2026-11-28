import type { GuidanceFiscalPeriod } from "../../contracts/intel";
import type { SplitActionInput } from "../performance/ledger-replay";

export interface PitFactCandidate {
  accession: string;
  concept: string;
  duration: "annual" | "quarter" | "instant" | "ytd";
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  periodStart: string | null;
  periodEnd: string;
  filedAt: string;
  value: number;
}

export interface BoundPeriodFact {
  value: number;
  accession: string;
  filedAt: string;
  periodStart: string | null;
  periodEnd: string;
  restated: boolean;
  derived: "fy_minus_9m" | null;
}

function targetDurationFor(period: GuidanceFiscalPeriod): "annual" | "quarter" {
  return period === "FY" ? "annual" : "quarter";
}

function groupByAccession(facts: readonly PitFactCandidate[]) {
  const byAcc = new Map<string, PitFactCandidate[]>();
  for (const f of facts) {
    const arr = byAcc.get(f.accession) ?? [];
    arr.push(f);
    byAcc.set(f.accession, arr);
  }
  return byAcc;
}

function isFactRestatedLater(
  facts: readonly PitFactCandidate[],
  concept: string,
  duration: "annual" | "quarter",
  currentRow: PitFactCandidate,
  originalAccession: string,
  originalFiledAt: string,
): boolean {
  const later = facts
    .filter(
      (f) =>
        f.concept === concept &&
        f.duration === duration &&
        f.periodEnd === currentRow.periodEnd &&
        f.accession !== originalAccession &&
        f.filedAt >= originalFiledAt,
    )
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt))[0];
  if (!later) return false;
  return (
    Math.abs(later.value - currentRow.value) / Math.max(Math.abs(currentRow.value), 1e-6) > 0.005
  );
}

/**
 * Binds a target `(FY t, P)` to the earliest-filed original filing `A*` and selects the current
 * reported period via `max(periodEnd)` inside `A*` so comparative prior years in the same 10-K/10-Q
 * never pollute guidance resolution regardless of DB row order (U0-6 / P0-4).
 */
export function bindPeriodFact(params: {
  facts: readonly PitFactCandidate[];
  concept: string;
  targetFiscalYear: number;
  targetFiscalPeriod: Exclude<GuidanceFiscalPeriod, "Q4">;
}): BoundPeriodFact | null {
  const duration = targetDurationFor(params.targetFiscalPeriod);
  const candidates = params.facts.filter(
    (f) =>
      f.concept === params.concept &&
      f.duration === duration &&
      f.fiscalYear === params.targetFiscalYear &&
      f.fiscalPeriod === params.targetFiscalPeriod,
  );
  if (candidates.length === 0) return null;
  const filings = [...groupByAccession(candidates).entries()]
    .map(([accession, rows]) => ({
      accession,
      filedAt: rows.reduce(
        (min, r) => (r.filedAt.localeCompare(min) < 0 ? r.filedAt : min),
        rows[0]?.filedAt ?? "",
      ),
      rows,
    }))
    .sort((a, b) => a.filedAt.localeCompare(b.filedAt) || a.accession.localeCompare(b.accession));
  const original = filings[0];
  if (!original) return null;
  const currentRow = original.rows.reduce(
    (best, r) => (r.periodEnd.localeCompare(best.periodEnd) > 0 ? r : best),
    original.rows[0] as PitFactCandidate,
  );
  return {
    value: currentRow.value,
    accession: original.accession,
    filedAt: original.filedAt,
    periodStart: currentRow.periodStart,
    periodEnd: currentRow.periodEnd,
    restated: isFactRestatedLater(
      params.facts,
      params.concept,
      duration,
      currentRow,
      original.accession,
      original.filedAt,
    ),
    derived: null,
  };
}

/**
 * Derives standalone Q4 flow metric as `FY(A*_FY) - YTD9M(A*_Q3)` strictly verifying that
 * the FY start aligns with YTD9M start and YTD9M ends before FY end (U0-6).
 */
export function bindQ4DerivedFact(params: {
  facts: readonly PitFactCandidate[];
  concept: string;
  targetFiscalYear: number;
}): BoundPeriodFact | null {
  const fy = bindPeriodFact({
    facts: params.facts,
    concept: params.concept,
    targetFiscalYear: params.targetFiscalYear,
    targetFiscalPeriod: "FY",
  });
  if (!fy) return null;
  const ytdCandidates = params.facts.filter(
    (f) =>
      f.concept === params.concept &&
      f.duration === "ytd" &&
      f.fiscalYear === params.targetFiscalYear &&
      f.fiscalPeriod === "Q3",
  );
  if (ytdCandidates.length === 0) return null;
  const byAcc = groupByAccession(ytdCandidates);
  const sortedAccs = [...byAcc.entries()].sort((a, b) => {
    const fa = a[1][0]?.filedAt ?? "";
    const fb = b[1][0]?.filedAt ?? "";
    return fa.localeCompare(fb) || a[0].localeCompare(b[0]);
  });
  const q3Orig = sortedAccs[0];
  if (!q3Orig) return null;
  const q3Row = q3Orig[1].reduce(
    (best, r) => (r.periodEnd > best.periodEnd ? r : best),
    q3Orig[1][0] as PitFactCandidate,
  );
  const startAligned =
    !fy.periodStart || !q3Row.periodStart || fy.periodStart === q3Row.periodStart;
  const endGapDays = Math.round(
    (Date.parse(`${fy.periodEnd}T00:00:00Z`) - Date.parse(`${q3Row.periodEnd}T00:00:00Z`)) /
      86_400_000,
  );
  if (!startAligned || endGapDays < 70 || endGapDays > 115) return null;
  return {
    value: fy.value - q3Row.value,
    accession: fy.accession,
    filedAt: fy.filedAt,
    periodStart: q3Row.periodEnd,
    periodEnd: fy.periodEnd,
    restated: fy.restated,
    derived: "fy_minus_9m",
  };
}

/**
 * Cumulative split multiplier `S = ∏_{e ∈ (issuedOn, filedAt]} r_e` used to adjust EPS guidance ranges
 * issued before a stock split onto the post-split basis of the actual 10-K/10-Q filing (U0-6).
 */
export function computeGuidanceEpsSplitFactor(
  issuedOn: string,
  filedAt: string,
  splits: readonly SplitActionInput[],
): number {
  let factor = 1;
  for (const sp of splits) {
    if (sp.exDate > issuedOn && sp.exDate <= filedAt && Number.isFinite(sp.ratio) && sp.ratio > 0) {
      factor *= sp.ratio;
    }
  }
  return factor;
}
