import { roundTo, type SecAnnualFinancial, type SecQuarterlyFinancial } from "@kanon/core";
import {
  type CurrencyNormalization,
  pickUnitListWithCurrency,
  resolveCurrencyNormalization,
  type SecFactsPayload,
  type SecFactUnit,
  scaleByNorm,
  type UnitKind,
  type XbrlFactsNamespace,
} from "./xbrl-helpers";
import {
  addThreeMonthsClamped,
  classifyDuration,
  decumulateYtd,
  diffDays,
  parseQuarterLabel,
  QUARTER_FRAME_RE,
  type QuarterPoint,
  shiftQuarterLabel,
  upsertStandalone,
  upsertYtd,
  VALID_Q_FORMS,
  type YtdBucket,
} from "./xbrl-period-utils";

function recordQuarterRow(
  row: SecFactUnit,
  unitKind: UnitKind,
  norm: CurrencyNormalization,
  matchedCurrency: string,
  buckets: {
    standalone: Map<string, QuarterPoint>;
    ytd6: Map<string, YtdBucket>;
    ytd9: Map<string, YtdBucket>;
  },
) {
  if (typeof row.val !== "number" || !row.end || !VALID_Q_FORMS.has(row.form ?? "")) return;
  const label = parseQuarterLabel(row);
  if (!label) return;
  const val = scaleByNorm(row.val, unitKind, norm, matchedCurrency);
  const filed = row.filed ?? "";
  const dur = classifyDuration(row);
  if ((row.frame && QUARTER_FRAME_RE.test(row.frame)) || dur === "q1") {
    upsertStandalone(buckets.standalone, { periodLabel: label, endDate: row.end, val, filed });
    return;
  }
  const ytd = { endDate: row.end, val, filed };
  if (dur === "m6") upsertYtd(buckets.ytd6, label, ytd);
  if (dur === "m9") upsertYtd(buckets.ytd9, label, ytd);
}

function mergeMapIfMissing<V>(target: Map<string, V>, source: Map<string, V>) {
  for (const [k, v] of source) if (!target.has(k)) target.set(k, v);
}

function collectFromNamespace(
  ns: XbrlFactsNamespace | undefined,
  tags: readonly string[],
  unitKind: UnitKind,
  norm: CurrencyNormalization,
) {
  const points = new Map<string, QuarterPoint>();
  const ytd9 = new Map<string, YtdBucket>();
  if (!ns) return { points, ytd9 };
  for (const tag of tags) {
    const matched = pickUnitListWithCurrency(ns[tag]?.units, unitKind, norm.currency);
    if (!matched) continue;
    const b = {
      standalone: new Map<string, QuarterPoint>(),
      ytd6: new Map<string, YtdBucket>(),
      ytd9: new Map<string, YtdBucket>(),
    };
    for (const row of matched.list)
      recordQuarterRow(row, unitKind, norm, matched.matchedCurrency, b);
    mergeMapIfMissing(points, decumulateYtd(b.standalone, b.ytd6, b.ytd9));
    mergeMapIfMissing(ytd9, b.ytd9);
  }
  return { points, ytd9 };
}

function matchesAnnualYtd9(
  ann: SecAnnualFinancial,
  fyYear: number,
  q3Label: string,
  b9: YtdBucket,
): boolean {
  if (ann.periodEndDate) {
    const gap = diffDays(b9.endDate, ann.periodEndDate);
    return gap !== null && gap >= 70 && gap <= 125;
  }
  return Number(q3Label.slice(0, 4)) === fyYear;
}

function deriveQ4ForAnnual(
  points: Map<string, QuarterPoint>,
  ytd9: Map<string, YtdBucket>,
  ann: SecAnnualFinancial,
  fyVal: number,
  fyYear: number,
) {
  for (const [q3Label, b9] of ytd9.entries()) {
    if (!matchesAnnualYtd9(ann, fyYear, q3Label, b9)) continue;
    const q4Label = shiftQuarterLabel(q3Label, 1);
    const q4End = ann.periodEndDate || addThreeMonthsClamped(b9.endDate);
    if (!q4Label || !q4End || points.has(q4Label)) continue;
    points.set(q4Label, {
      periodLabel: q4Label,
      endDate: q4End,
      val: fyVal - b9.val,
      filed: b9.filed,
    });
  }
}

function injectDerivedQ4(
  points: Map<string, QuarterPoint>,
  ytd9: Map<string, YtdBucket>,
  annuals: readonly SecAnnualFinancial[],
  readAnnual: (row: SecAnnualFinancial) => number | null,
) {
  for (const ann of annuals) {
    const fyVal = readAnnual(ann);
    const fyYear = Number(ann.fiscalYear.replace(/^FY/i, ""));
    if (fyVal === null || !Number.isFinite(fyYear)) continue;
    deriveQ4ForAnnual(points, ytd9, ann, fyVal, fyYear);
  }
}

function enrichYoY(rows: SecQuarterlyFinancial[]): SecQuarterlyFinancial[] {
  const byLabel = new Map(rows.map((r) => [r.periodLabel, r]));
  return rows.map((row) => {
    const prev = byLabel.get(shiftQuarterLabel(row.periodLabel, -4) ?? "");
    const revYoY =
      prev?.revenue && prev.revenue > 0 && row.revenue !== null
        ? roundTo(((row.revenue - prev.revenue) / prev.revenue) * 100, 1)
        : null;
    const gmYoY =
      prev?.grossMarginPct != null && row.grossMarginPct !== null
        ? Math.round((row.grossMarginPct - prev.grossMarginPct) * 100)
        : null;
    return { ...row, revenueYoYPct: revYoY, grossMarginYoYBps: gmYoY };
  });
}

function collectAllQuarterlySeries(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization,
) {
  const q = (us: readonly string[], ifrs: readonly string[], unit: UnitKind = "monetary") => {
    const res = collectFromNamespace(facts?.["us-gaap"], us, unit, norm);
    return res.points.size > 0 ? res : collectFromNamespace(facts?.["ifrs-full"], ifrs, unit, norm);
  };
  return {
    rev: q(
      ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
      ["Revenue"],
    ),
    gp: q(["GrossProfit"], ["GrossProfit"]),
    cogs: q(["CostOfRevenue", "CostOfGoodsAndServicesSold"], ["CostOfSales"]),
    ebit: q(["OperatingIncomeLoss"], ["ProfitLossFromOperatingActivities"]),
    ni: q(["NetIncomeLoss"], ["ProfitLoss"]),
    ocf: q(
      ["NetCashProvidedByUsedInOperatingActivities"],
      ["CashFlowsFromUsedInOperatingActivities"],
    ),
    capex: q(
      ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
      ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    ),
    eps: q(["EarningsPerShareDiluted"], ["DilutedEarningsLossPerShare"], "perShare"),
  };
}

function buildQuarterlyRow(
  pt: QuarterPoint,
  s: ReturnType<typeof collectAllQuarterlySeries>,
): SecQuarterlyFinancial {
  const k = pt.periodLabel;
  const cogs = s.cogs.points.get(k)?.val ?? null;
  const g = s.gp.points.get(k)?.val ?? (cogs !== null ? pt.val - cogs : null);
  const o = s.ocf.points.get(k)?.val ?? null;
  const c = s.capex.points.get(k)?.val ?? null;
  return {
    periodLabel: k,
    endDate: pt.endDate,
    revenue: pt.val,
    grossProfit: g,
    grossMarginPct: pt.val > 0 && g !== null ? roundTo((g / pt.val) * 100, 1) : null,
    operatingIncome: s.ebit.points.get(k)?.val ?? null,
    netIncome: s.ni.points.get(k)?.val ?? null,
    freeCashFlow: o !== null && c !== null ? o - Math.abs(c) : null,
    dilutedEps: s.eps.points.get(k)?.val ?? null,
    revenueYoYPct: null,
    grossMarginYoYBps: null,
  };
}

export function extractQuarterlyHistory(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization = resolveCurrencyNormalization(facts),
  annuals: readonly SecAnnualFinancial[] = [],
): SecQuarterlyFinancial[] {
  const s = collectAllQuarterlySeries(facts, norm);
  if (annuals.length > 0) {
    injectDerivedQ4(s.rev.points, s.rev.ytd9, annuals, (a) => a.revenue);
    injectDerivedQ4(s.gp.points, s.gp.ytd9, annuals, (a) => a.grossProfit);
    injectDerivedQ4(s.ebit.points, s.ebit.ytd9, annuals, (a) => a.operatingIncome ?? null);
    injectDerivedQ4(s.ni.points, s.ni.ytd9, annuals, (a) => a.netIncome);
    injectDerivedQ4(s.ocf.points, s.ocf.ytd9, annuals, (a) => a.operatingCashFlow);
    injectDerivedQ4(s.capex.points, s.capex.ytd9, annuals, (a) => a.capex);
    injectDerivedQ4(s.eps.points, s.eps.ytd9, annuals, (a) => a.dilutedEps);
  }
  const labels = [...s.rev.points.values()]
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(-12);
  return enrichYoY(labels.map((pt) => buildQuarterlyRow(pt, s))).slice(-8);
}
