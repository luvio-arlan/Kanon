export interface SecFactUnit {
  val?: number;
  form?: string;
  fy?: number;
  fp?: string;
  start?: string;
  end?: string;
  filed?: string;
  frame?: string;
}

export type XbrlFactsNamespace = Record<
  string,
  { units?: Record<string, SecFactUnit[] | undefined> }
>;

export interface SecFactsPayload {
  "us-gaap"?: XbrlFactsNamespace;
  "ifrs-full"?: XbrlFactsNamespace;
}

export type UnitKind = "monetary" | "perShare" | "shares";

export interface CurrencyNormalization {
  currency: string;
  fxToUsd: number;
  adrRatio: number;
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

export function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function diffDays(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return Math.round((e - s) / 86_400_000);
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
  if ((counts.get("USD") ?? 0) === 0 && counts.size > 0) {
    currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }
  const upperTicker = ticker?.trim().toUpperCase() ?? "";
  const adrRatio = currency === "USD" ? 1 : (ADR_RATIO_BY_TICKER[upperTicker] ?? 1);
  return { currency, fxToUsd: FX_TO_USD[currency] ?? 1, adrRatio };
}

export function pickUnitList(
  units: Record<string, SecFactUnit[] | undefined> | undefined,
  unitKind: UnitKind,
  currency: string,
): SecFactUnit[] | undefined {
  if (!units) return undefined;
  if (unitKind === "shares") return units.shares;
  if (unitKind === "perShare") {
    return units[`${currency}/shares`] ?? units["USD/shares"];
  }
  return units[currency] ?? units.USD;
}

export function scaleByNorm(val: number, unitKind: UnitKind, norm: CurrencyNormalization): number {
  if (unitKind === "shares") return val / norm.adrRatio;
  if (unitKind === "perShare") return val * norm.fxToUsd * norm.adrRatio;
  return val * norm.fxToUsd;
}

function isValidAnnualRow(
  row: SecFactUnit,
  kind: "flow" | "instant",
): row is { val: number; fy: number; end?: string; filed?: string; frame?: string } {
  const annualForm = row.form === "10-K" || row.form === "20-F";
  if (!annualForm || typeof row.val !== "number" || typeof row.fy !== "number") return false;
  if (kind === "instant") {
    return !row.start || (diffDays(row.start, row.end) ?? 0) <= 5;
  }
  if (row.frame && /^CY\d{4}$/.test(row.frame)) return true;
  const days = diffDays(row.start, row.end);
  if (days !== null) return days >= 320 && days <= 395;
  return !row.fp || row.fp === "FY";
}

function resolvePeriodYear(row: { fy: number; end?: string; frame?: string }): number {
  const frameMatch = row.frame ? /^CY(\d{4})$/.exec(row.frame) : null;
  if (frameMatch?.[1]) return Number(frameMatch[1]);
  if (row.end && /^\d{4}-\d{2}-\d{2}/.test(row.end)) {
    const yr = Number(row.end.slice(0, 4));
    const mo = Number(row.end.slice(5, 7));
    return mo === 1 ? yr - 1 : yr;
  }
  return row.fy;
}

function indexAnnualRows(
  list: readonly SecFactUnit[],
  kind: "flow" | "instant",
  unitKind: UnitKind,
  norm: CurrencyNormalization,
): Map<number, number> {
  const byYear = new Map<number, { filed: string; filingFy: number; end: string; val: number }>();
  for (const row of list) {
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
        val: scaleByNorm(row.val, unitKind, norm),
      });
    }
  }
  return new Map([...byYear.entries()].map(([fy, v]) => [fy, v.val]));
}

function collectFromNamespace(
  ns: XbrlFactsNamespace | undefined,
  tags: readonly string[],
  unitKind: UnitKind,
  kind: "flow" | "instant",
  norm: CurrencyNormalization,
): Map<number, number> {
  if (!ns) return new Map();
  const merged = new Map<number, number>();
  for (const tag of tags) {
    const list = pickUnitList(ns[tag]?.units, unitKind, norm.currency);
    if (!list) continue;
    for (const [yr, val] of indexAnnualRows(list, kind, unitKind, norm).entries()) {
      if (!merged.has(yr)) merged.set(yr, val);
    }
  }
  return merged;
}

export function collectAnnualMap(
  facts: SecFactsPayload | undefined,
  usTags: readonly string[],
  ifrsTags: readonly string[] = [],
  unitKind: UnitKind = "monetary",
  kind: "flow" | "instant" = "flow",
  norm: CurrencyNormalization = { currency: "USD", fxToUsd: 1, adrRatio: 1 },
): Map<number, number> {
  const usMap = collectFromNamespace(facts?.["us-gaap"], usTags, unitKind, kind, norm);
  if (usMap.size > 0) return usMap;
  return collectFromNamespace(facts?.["ifrs-full"], ifrsTags, unitKind, kind, norm);
}
