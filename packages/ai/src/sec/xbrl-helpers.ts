import { isValidAnnualRow, resolvePeriodYear, type SecFactUnit } from "./xbrl-period-utils";

export type { SecFactUnit };

export type XbrlFactsNamespace = Record<
  string,
  { units?: Record<string, SecFactUnit[] | undefined> }
>;

export interface SecFactsPayload {
  "us-gaap"?: XbrlFactsNamespace;
  "ifrs-full"?: XbrlFactsNamespace;
  dei?: XbrlFactsNamespace;
}

export type UnitKind = "monetary" | "perShare" | "shares";

export interface CurrencyNormalization {
  currency: string;
  fxToUsd: number;
  adrRatio: number;
}

export interface MatchedUnitList {
  list: SecFactUnit[];
  matchedCurrency: string;
}

const FX_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.13,
  CAD: 0.72,
  CNY: 0.138,
  RMB: 0.138,
  HKD: 0.128,
  TWD: 0.031,
  JPY: 0.0066,
  DKK: 0.145,
  KRW: 0.00072,
};

const ADR_RATIO_BY_TICKER: Record<string, number> = {
  TSM: 5,
  BABA: 8,
  PDD: 4,
  JD: 2,
  BIDU: 8,
  NTES: 5,
  TM: 10,
  AZN: 2,
  GSK: 2,
  BTI: 1,
  ASML: 1,
  NVO: 1,
  SAP: 1,
  SONY: 1,
  ARM: 1,
};

const SUPPORTED_CURRENCIES = Object.keys(FX_TO_USD);

const COMPACT_CURRENCY_PREFIX: Readonly<Record<string, string>> = {
  USD: "$",
  HKD: "HK$",
  CNY: "¥",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
};

/** Compact money label in the reporting currency (`HK$12.3B`); unknown codes keep the ISO code. */
export function formatCompactMoney(value: number, currency = "USD"): string {
  const code = currency.trim().toUpperCase();
  const prefix = COMPACT_CURRENCY_PREFIX[code] ?? `${code} `;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${prefix}${abs.toFixed(0)}`;
}

export function formatUsdCompact(value: number): string {
  return formatCompactMoney(value, "USD");
}

const CURRENCY_PROBE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "Revenue",
  "NetIncomeLoss",
  "ProfitLoss",
] as const;

function tallyUnits(
  units: Record<string, SecFactUnit[] | undefined> | undefined,
  counts: Map<string, number>,
) {
  if (!units) return;
  for (const cur of SUPPORTED_CURRENCIES) {
    const len = units[cur]?.length ?? 0;
    if (len > 0) counts.set(cur, (counts.get(cur) ?? 0) + len);
  }
}

function scanCurrencyCounts(ns: XbrlFactsNamespace | undefined, counts: Map<string, number>) {
  if (!ns) return;
  for (const tag of CURRENCY_PROBE_TAGS) tallyUnits(ns[tag]?.units, counts);
}

export function resolveCurrencyNormalization(
  facts: SecFactsPayload | undefined,
  ticker?: string,
): CurrencyNormalization {
  const counts = new Map<string, number>();
  scanCurrencyCounts(facts?.["us-gaap"], counts);
  scanCurrencyCounts(facts?.["ifrs-full"], counts);
  let currency = "USD";
  if (counts.size > 0) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const usdCount = counts.get("USD") ?? 0;
    currency = top && (top[0] === "USD" || top[1] > usdCount) ? top[0] : "USD";
  }
  const upperTicker = ticker?.trim().toUpperCase() ?? "";
  const adrRatio = currency === "USD" ? 1 : (ADR_RATIO_BY_TICKER[upperTicker] ?? 1);
  return { currency, fxToUsd: FX_TO_USD[currency] ?? 1, adrRatio };
}

export function pickUnitListWithCurrency(
  units: Record<string, SecFactUnit[] | undefined> | undefined,
  unitKind: UnitKind,
  currency: string,
): MatchedUnitList | undefined {
  if (!units) return undefined;
  if (unitKind === "shares") {
    return units.shares ? { list: units.shares, matchedCurrency: currency } : undefined;
  }
  if (unitKind === "perShare") {
    if (units[`${currency}/shares`]) {
      return { list: units[`${currency}/shares`] ?? [], matchedCurrency: currency };
    }
    return units["USD/shares"] ? { list: units["USD/shares"], matchedCurrency: "USD" } : undefined;
  }
  if (units[currency]) return { list: units[currency], matchedCurrency: currency };
  return units.USD ? { list: units.USD, matchedCurrency: "USD" } : undefined;
}

export function scaleByNorm(
  val: number,
  unitKind: UnitKind,
  norm: CurrencyNormalization,
  matchedCurrency?: string,
): number {
  const effectiveFx = matchedCurrency === "USD" ? 1 : norm.fxToUsd;
  const effectiveAdr = matchedCurrency === "USD" ? 1 : norm.adrRatio;
  if (unitKind === "shares") return val / norm.adrRatio;
  if (unitKind === "perShare") return val * effectiveFx * effectiveAdr;
  return val * effectiveFx;
}

function indexAnnualEntries(
  matched: MatchedUnitList,
  kind: "flow" | "instant",
  unitKind: UnitKind,
  norm: CurrencyNormalization,
): Map<number, { val: number; end: string }> {
  const byYear = new Map<number, { filed: string; filingFy: number; end: string; val: number }>();
  for (const row of matched.list) {
    if (!isValidAnnualRow(row, kind)) continue;
    const periodYr = resolvePeriodYear(row);
    const filed = row.filed ?? "";
    const end = row.end ?? "";
    const prev = byYear.get(periodYr);
    const better =
      !prev ||
      (filed && prev.filed ? filed > prev.filed : row.fy > prev.filingFy) ||
      (filed === prev.filed && row.fy === prev.filingFy && end > prev.end);
    if (better) {
      byYear.set(periodYr, {
        filed,
        filingFy: row.fy,
        end,
        val: scaleByNorm(row.val, unitKind, norm, matched.matchedCurrency),
      });
    }
  }
  return new Map([...byYear.entries()].map(([fy, v]) => [fy, { val: v.val, end: v.end }]));
}

function collectEntriesFromNs(
  ns: XbrlFactsNamespace | undefined,
  tags: readonly string[],
  unitKind: UnitKind,
  kind: "flow" | "instant",
  norm: CurrencyNormalization,
): Map<number, { val: number; end: string }> {
  if (!ns) return new Map();
  const merged = new Map<number, { val: number; end: string }>();
  for (const tag of tags) {
    const matched = pickUnitListWithCurrency(ns[tag]?.units, unitKind, norm.currency);
    if (!matched) continue;
    for (const [yr, entry] of indexAnnualEntries(matched, kind, unitKind, norm).entries()) {
      if (!merged.has(yr)) merged.set(yr, entry);
    }
  }
  return merged;
}

export function collectAnnualEntryMap(
  facts: SecFactsPayload | undefined,
  usTags: readonly string[],
  ifrsTags: readonly string[] = [],
  unitKind: UnitKind = "monetary",
  kind: "flow" | "instant" = "flow",
  norm: CurrencyNormalization = { currency: "USD", fxToUsd: 1, adrRatio: 1 },
): Map<number, { val: number; end: string }> {
  const usMap = collectEntriesFromNs(facts?.["us-gaap"], usTags, unitKind, kind, norm);
  if (usMap.size > 0) return usMap;
  const ifrsMap = collectEntriesFromNs(facts?.["ifrs-full"], ifrsTags, unitKind, kind, norm);
  if (ifrsMap.size > 0) return ifrsMap;
  return collectEntriesFromNs(facts?.dei, usTags, unitKind, kind, norm);
}

export function collectAnnualMap(
  facts: SecFactsPayload | undefined,
  usTags: readonly string[],
  ifrsTags: readonly string[] = [],
  unitKind: UnitKind = "monetary",
  kind: "flow" | "instant" = "flow",
  norm: CurrencyNormalization = { currency: "USD", fxToUsd: 1, adrRatio: 1 },
): Map<number, number> {
  const entries = collectAnnualEntryMap(facts, usTags, ifrsTags, unitKind, kind, norm);
  return new Map([...entries.entries()].map(([fy, entry]) => [fy, entry.val]));
}
