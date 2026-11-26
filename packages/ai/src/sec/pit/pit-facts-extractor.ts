import type { FinancialFactDuration } from "@kanon/core";
import {
  type CurrencyNormalization,
  pickUnitListWithCurrency,
  type SecFactsPayload,
  scaleByNorm,
  type UnitKind,
} from "../xbrl-helpers";
import { diffDays, type SecFactUnit } from "../xbrl-period-utils";

export interface ExtractedPitFact {
  accession: string;
  form: string;
  concept: string;
  xbrlTag: string;
  taxonomy: "us-gaap" | "ifrs-full";
  periodStart: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  value: number;
  unit: string;
  currency: string;
  filedAt: string;
}

interface PitConceptSpec {
  concept: string;
  usTags: readonly string[];
  ifrsTags: readonly string[];
  unitKind: UnitKind;
  unitLabel: string;
  isInstant: boolean;
}

const PIT_CONCEPT_SPECS: readonly PitConceptSpec[] = [
  {
    concept: "revenue",
    usTags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    ifrsTags: ["Revenue"],
    unitKind: "monetary",
    unitLabel: "USD",
    isInstant: false,
  },
  {
    concept: "gross_profit",
    usTags: ["GrossProfit"],
    ifrsTags: ["GrossProfit"],
    unitKind: "monetary",
    unitLabel: "USD",
    isInstant: false,
  },
  {
    concept: "net_income",
    usTags: ["NetIncomeLoss"],
    ifrsTags: ["ProfitLoss"],
    unitKind: "monetary",
    unitLabel: "USD",
    isInstant: false,
  },
  {
    concept: "operating_cash_flow",
    usTags: ["NetCashProvidedByUsedInOperatingActivities"],
    ifrsTags: ["CashFlowsFromUsedInOperatingActivities"],
    unitKind: "monetary",
    unitLabel: "USD",
    isInstant: false,
  },
  {
    concept: "capex",
    usTags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    ifrsTags: ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    unitKind: "monetary",
    unitLabel: "USD",
    isInstant: false,
  },
  {
    concept: "diluted_eps",
    usTags: ["EarningsPerShareDiluted"],
    ifrsTags: ["DilutedEarningsLossPerShare"],
    unitKind: "perShare",
    unitLabel: "USD/shares",
    isInstant: false,
  },
  {
    concept: "diluted_shares",
    usTags: ["WeightedAverageNumberOfDilutedSharesOutstanding", "CommonStockSharesOutstanding"],
    ifrsTags: ["AdjustedWeightedAverageShares", "WeightedAverageShares"],
    unitKind: "shares",
    unitLabel: "shares",
    isInstant: false,
  },
  {
    concept: "cash_and_equiv",
    usTags: ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue"],
    ifrsTags: ["CashAndCashEquivalents"],
    unitKind: "monetary",
    unitLabel: "USD",
    isInstant: true,
  },
];

const ALLOWED_PIT_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "6-K"]);

function inferFactDuration(row: SecFactUnit, isInstant: boolean): FinancialFactDuration | null {
  if (isInstant) return "instant";
  const days = diffDays(row.start, row.end);
  if (days !== null) {
    if (days >= 320 && days <= 395) return "annual";
    if (days >= 245 && days <= 300) return "ytd";
    if (days >= 65 && days <= 120) return "quarter";
    return null;
  }
  if (row.fp === "FY") return "annual";
  return null;
}

function toExtractedPitFact(
  row: SecFactUnit,
  taxonomy: "us-gaap" | "ifrs-full",
  tag: string,
  spec: PitConceptSpec,
  norm: CurrencyNormalization,
  matchedCurrency: string,
): { key: string; fact: ExtractedPitFact } | null {
  if (!row.accn || !row.filed || !row.end || !row.form) return null;
  if (!ALLOWED_PIT_FORMS.has(row.form)) return null;
  if (typeof row.val !== "number" || !Number.isFinite(row.val)) return null;
  const duration = inferFactDuration(row, spec.isInstant);
  if (!duration) return null;
  return {
    key: `${row.accn}:${spec.concept}:${row.end}:${duration}`,
    fact: {
      accession: row.accn,
      form: row.form,
      concept: spec.concept,
      xbrlTag: tag,
      taxonomy,
      periodStart: row.start ?? null,
      periodEnd: row.end,
      duration,
      fiscalYear: typeof row.fy === "number" ? row.fy : null,
      fiscalPeriod: row.fp ?? null,
      value: scaleByNorm(row.val, spec.unitKind, norm, matchedCurrency),
      unit: spec.unitLabel,
      currency: "USD",
      filedAt: row.filed,
    },
  };
}

function collectSpecFromNamespace(
  ns: SecFactsPayload["us-gaap"],
  taxonomy: "us-gaap" | "ifrs-full",
  tags: readonly string[],
  spec: PitConceptSpec,
  norm: CurrencyNormalization,
  out: Map<string, ExtractedPitFact>,
) {
  if (!ns) return;
  for (const tag of tags) {
    const matched = pickUnitListWithCurrency(ns[tag]?.units, spec.unitKind, norm.currency);
    if (!matched) continue;
    for (const row of matched.list) {
      const built = toExtractedPitFact(row, taxonomy, tag, spec, norm, matched.matchedCurrency);
      if (built && !out.has(built.key)) out.set(built.key, built.fact);
    }
  }
}

/**
 * Extracts per-fact Point-in-Time records directly from SEC companyfacts payload,
 * preserving each fact's true `accn`, `filed`, `periodEnd`, `duration`, and matched `xbrlTag`.
 */
export function extractPitFactsFromCompanyFacts(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization,
): ExtractedPitFact[] {
  if (!facts) return [];
  const out = new Map<string, ExtractedPitFact>();
  for (const spec of PIT_CONCEPT_SPECS) {
    collectSpecFromNamespace(facts["us-gaap"], "us-gaap", spec.usTags, spec, norm, out);
    collectSpecFromNamespace(facts["ifrs-full"], "ifrs-full", spec.ifrsTags, spec, norm, out);
  }
  return [...out.values()].sort((a, b) => a.filedAt.localeCompare(b.filedAt));
}
