import type { ExtractedPitFact } from "@kanon/ai";
import type { SecSnapshot } from "@kanon/core";
import {
  type KanonDb,
  type UpsertFinancialFactInput,
  upsertFiling,
  upsertFinancialFacts,
} from "@kanon/core/db";

const ANNUAL_CONCEPTS = [
  { field: "revenue" as const, concept: "revenue", xbrlTag: "Revenues", unit: "USD" },
  { field: "grossProfit" as const, concept: "gross_profit", xbrlTag: "GrossProfit", unit: "USD" },
  { field: "netIncome" as const, concept: "net_income", xbrlTag: "NetIncomeLoss", unit: "USD" },
  {
    field: "operatingCashFlow" as const,
    concept: "operating_cash_flow",
    xbrlTag: "NetCashProvidedByUsedInOperatingActivities",
    unit: "USD",
  },
  {
    field: "capex" as const,
    concept: "capex",
    xbrlTag: "PaymentsToAcquirePropertyPlantAndEquipment",
    unit: "USD",
  },
  {
    field: "dilutedEps" as const,
    concept: "diluted_eps",
    xbrlTag: "EarningsPerShareDiluted",
    unit: "USD/shares",
  },
];

function matchAnnualFiling(snapshot: SecSnapshot, periodEnd: string) {
  const yearPrefix = periodEnd.slice(0, 4);
  const annualForms = snapshot.filings.filter((f) => f.form === "10-K" || f.form === "20-F");
  return (
    annualForms.find((f) => f.reportDate === periodEnd) ??
    annualForms.find((f) => f.reportDate?.startsWith(yearPrefix)) ??
    annualForms[0] ??
    snapshot.filings[0]
  );
}

function appendAnnualFactRows(
  rows: UpsertFinancialFactInput[],
  securityId: string,
  snapshot: SecSnapshot,
  annual: SecSnapshot["annuals"][number],
) {
  const periodEnd = annual.periodEndDate;
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return;
  const filing = matchAnnualFiling(snapshot, periodEnd);
  if (!filing?.accessionNumber || !filing.filingDate) return;
  const yearMatch = annual.fiscalYear.match(/\d{4}/);
  const fiscalYear = yearMatch ? Number(yearMatch[0]) : null;
  for (const spec of ANNUAL_CONCEPTS) {
    const val = annual[spec.field];
    if (typeof val !== "number" || !Number.isFinite(val)) continue;
    rows.push({
      id: `${securityId}:${filing.accessionNumber}:${spec.concept}:${periodEnd}:annual`,
      securityId,
      accession: filing.accessionNumber,
      concept: spec.concept,
      xbrlTag: spec.xbrlTag,
      periodEnd,
      duration: "annual",
      fiscalYear,
      fiscalPeriod: "FY",
      value: val,
      unit: spec.unit,
      currency: snapshot.reportingCurrency,
      filedAt: filing.filingDate,
    });
  }
}

export function buildFallbackAnnualFacts(
  securityId: string,
  snapshot: SecSnapshot,
): UpsertFinancialFactInput[] {
  const rows: UpsertFinancialFactInput[] = [];
  for (const annual of snapshot.annuals) {
    appendAnnualFactRows(rows, securityId, snapshot, annual);
  }
  return rows;
}

function toPitFactRow(securityId: string, f: ExtractedPitFact): UpsertFinancialFactInput {
  return {
    id: `${securityId}:${f.accession}:${f.concept}:${f.periodEnd}:${f.duration}`,
    securityId,
    accession: f.accession,
    concept: f.concept,
    xbrlTag: f.xbrlTag,
    taxonomy: f.taxonomy,
    periodStart: f.periodStart,
    periodEnd: f.periodEnd,
    duration: f.duration,
    fiscalYear: f.fiscalYear,
    fiscalPeriod: f.fiscalPeriod,
    value: f.value,
    unit: f.unit,
    currency: f.currency,
    filedAt: f.filedAt,
  };
}

export async function persistExtractedPitFacts(
  db: KanonDb,
  securityId: string,
  cik: string,
  pitFacts: readonly ExtractedPitFact[],
): Promise<void> {
  const seenAccns = new Set<string>();
  const rows: UpsertFinancialFactInput[] = [];
  for (const f of pitFacts) {
    if (!seenAccns.has(f.accession)) {
      seenAccns.add(f.accession);
      const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession.replaceAll("-", "")}/`;
      await upsertFiling(db, {
        accession: f.accession,
        securityId,
        cik,
        form: f.form,
        filedAt: f.filedAt,
        periodEnd: f.periodEnd,
        fiscalYear: f.fiscalYear,
        fiscalPeriod: f.fiscalPeriod,
        primaryDocUrl: url,
        parseStatus: "pit-synced",
      });
    }
    rows.push(toPitFactRow(securityId, f));
  }
  if (rows.length > 0) await upsertFinancialFacts(db, rows);
}
