import type { RedlineSection } from "@kanon/core";

export interface ComparableFilingCandidate {
  accession: string;
  form: string;
  filedAt: string;
  periodEnd: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  primaryDocUrl: string;
}

function baseForm(form: string): string {
  return form.toUpperCase().replace(/\/A$/, "");
}

function isAmendment(form: string): boolean {
  return form.toUpperCase().endsWith("/A");
}

function pickBestCandidate(
  list: readonly ComparableFilingCandidate[],
): ComparableFilingCandidate | null {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => {
    const amendDiff = Number(isAmendment(a.form)) - Number(isAmendment(b.form));
    return amendDiff !== 0 ? amendDiff : b.filedAt.localeCompare(a.filedAt);
  });
  return sorted[0] ?? null;
}

function inferPriorYear(target: ComparableFilingCandidate): number | null {
  if (target.fiscalYear !== null) return target.fiscalYear - 1;
  if (target.periodEnd && /^\d{4}-/.test(target.periodEnd)) {
    return Number(target.periodEnd.slice(0, 4)) - 1;
  }
  return null;
}

function matchAnnualPrior(
  target: ComparableFilingCandidate,
  older: readonly ComparableFilingCandidate[],
  targetBase: string,
): ComparableFilingCandidate | null {
  const priorFy = inferPriorYear(target);
  const sameForm = older.filter((f) => baseForm(f.form) === targetBase);
  if (priorFy !== null) {
    const exactFy = sameForm.filter(
      (f) => f.fiscalYear === priorFy || f.periodEnd?.startsWith(`${priorFy}-`),
    );
    if (exactFy.length > 0) return pickBestCandidate(exactFy);
  }
  return pickBestCandidate(sameForm);
}

function matchQuarterPrior(
  target: ComparableFilingCandidate,
  older: readonly ComparableFilingCandidate[],
  section: RedlineSection,
): ComparableFilingCandidate | null {
  if (section === "risk_factors") {
    const prevAny = older.filter((f) => baseForm(f.form) === "10-Q" || baseForm(f.form) === "10-K");
    return prevAny.sort((a, b) => b.filedAt.localeCompare(a.filedAt))[0] ?? null;
  }
  const targetFy = target.fiscalYear;
  if (!target.fiscalPeriod || targetFy === null) return null;
  const sameQuarter = older.filter(
    (f) =>
      baseForm(f.form) === "10-Q" &&
      f.fiscalYear === targetFy - 1 &&
      f.fiscalPeriod === target.fiscalPeriod,
  );
  return pickBestCandidate(sameQuarter);
}

/**
 * Selects a strictly comparable prior filing (R1):
 * - 10-K FY t -> 10-K FY t-1 (original preferred over /A)
 * - 20-F FY t -> 20-F FY t-1
 * - 10-Q FY t Qn (MD&A) -> 10-Q FY t-1 Qn (never cross-pairs with 10-K)
 * - 10-Q (Risk Factors) -> immediately preceding 10-Q or 10-K
 */
export function findComparablePriorFiling(params: {
  target: ComparableFilingCandidate;
  filings: readonly ComparableFilingCandidate[];
  section: RedlineSection;
}): ComparableFilingCandidate | null {
  const { target, filings, section } = params;
  const targetBase = baseForm(target.form);
  const older = filings.filter(
    (f) => f.accession !== target.accession && f.filedAt < target.filedAt,
  );
  if (targetBase === "10-K" || targetBase === "20-F") {
    return matchAnnualPrior(target, older, targetBase);
  }
  if (targetBase === "10-Q") return matchQuarterPrior(target, older, section);
  return null;
}
