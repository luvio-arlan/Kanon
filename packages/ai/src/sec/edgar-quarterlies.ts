import { roundTo, type SecAnnualFinancial, type SecQuarterlyFinancial } from "@kanon/core";
import {
  type CurrencyNormalization,
  diffDays,
  pickUnitList,
  resolveCurrencyNormalization,
  type SecFactsPayload,
  type SecFactUnit,
  scaleByNorm,
  type UnitKind,
  type XbrlFactsNamespace,
} from "./xbrl-helpers";

interface QuarterPoint {
  periodLabel: string;
  endDate: string;
  val: number;
}
interface YtdBucket {
  endDate: string;
  val: number;
  filed: string;
}

const QUARTER_FRAME_RE = /^CY(\d{4})Q([1-4])$/;
const VALID_Q_FORMS = new Set(["10-Q", "10-K", "6-K", "20-F"]);

function parseQuarterLabel(row: SecFactUnit): string | null {
  const m = row.frame ? QUARTER_FRAME_RE.exec(row.frame) : null;
  if (m?.[1] && m[2]) return `${m[1]} Q${m[2]}`;
  if (!row.end) return null;
  const month = Number(row.end.slice(5, 7));
  if (!Number.isFinite(month)) return null;
  return `${row.end.slice(0, 4)} Q${month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4}`;
}

function classifyDuration(row: SecFactUnit): "q1" | "m6" | "m9" | null {
  const days = diffDays(row.start, row.end);
  if (days === null) return null;
  if (days >= 70 && days <= 115) return "q1";
  if (days >= 160 && days <= 205) return "m6";
  return days >= 250 && days <= 295 ? "m9" : null;
}

function shiftQuarterLabel(label: string, delta: number): string | null {
  const m = /^(\d{4})\s+Q([1-4])$/.exec(label);
  if (!m?.[1] || !m[2]) return null;
  const total = Number(m[1]) * 4 + (Number(m[2]) - 1) + delta;
  return `${Math.floor(total / 4)} Q${(((total % 4) + 4) % 4) + 1}`;
}

function upsertYtd(map: Map<string, YtdBucket>, label: string, next: YtdBucket) {
  const prev = map.get(label);
  if (!prev || next.filed > prev.filed || next.endDate > prev.endDate) map.set(label, next);
}

function upsertStandalone(map: Map<string, QuarterPoint>, next: QuarterPoint) {
  const prev = map.get(next.periodLabel);
  if (!prev || next.endDate > prev.endDate) map.set(next.periodLabel, next);
}

function recordQuarterRow(
  row: SecFactUnit,
  unitKind: UnitKind,
  norm: CurrencyNormalization,
  buckets: {
    standalone: Map<string, QuarterPoint>;
    ytd6: Map<string, YtdBucket>;
    ytd9: Map<string, YtdBucket>;
  },
) {
  if (typeof row.val !== "number" || !row.end || !VALID_Q_FORMS.has(row.form ?? "")) return;
  const label = parseQuarterLabel(row);
  if (!label) return;
  const val = scaleByNorm(row.val, unitKind, norm);
  const dur = classifyDuration(row);
  if ((row.frame && QUARTER_FRAME_RE.test(row.frame)) || dur === "q1") {
    upsertStandalone(buckets.standalone, { periodLabel: label, endDate: row.end, val });
    return;
  }
  const ytd = { endDate: row.end, val, filed: row.filed ?? "" };
  if (dur === "m6") upsertYtd(buckets.ytd6, label, ytd);
  if (dur === "m9") upsertYtd(buckets.ytd9, label, ytd);
}

function decumulateYtd(
  standalone: Map<string, QuarterPoint>,
  ytd6: Map<string, YtdBucket>,
  ytd9: Map<string, YtdBucket>,
): Map<string, QuarterPoint> {
  const out = new Map(standalone);
  for (const [label, b6] of ytd6.entries()) {
    const q1 = out.has(label) ? undefined : out.get(shiftQuarterLabel(label, -1) ?? "");
    if (q1) out.set(label, { periodLabel: label, endDate: b6.endDate, val: b6.val - q1.val });
  }
  for (const [label, b9] of ytd9.entries()) {
    const b6 = out.has(label) ? undefined : ytd6.get(shiftQuarterLabel(label, -1) ?? "");
    if (b6) out.set(label, { periodLabel: label, endDate: b9.endDate, val: b9.val - b6.val });
  }
  return out;
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
    const list = pickUnitList(ns[tag]?.units, unitKind, norm.currency);
    if (!list) continue;
    const b = {
      standalone: new Map<string, QuarterPoint>(),
      ytd6: new Map<string, YtdBucket>(),
      ytd9: new Map<string, YtdBucket>(),
    };
    for (const row of list) recordQuarterRow(row, unitKind, norm, b);
    mergeMapIfMissing(points, decumulateYtd(b.standalone, b.ytd6, b.ytd9));
    mergeMapIfMissing(ytd9, b.ytd9);
  }
  return { points, ytd9 };
}

function deriveQ4ForYear(
  fyYear: number,
  fyVal: number,
  points: Map<string, QuarterPoint>,
  ytd9: Map<string, YtdBucket>,
) {
  for (const [q3Label, b9] of ytd9.entries()) {
    if (Math.abs(Number(q3Label.slice(0, 4)) - fyYear) > 1) continue;
    const q4Label = shiftQuarterLabel(q3Label, 1);
    const d = new Date(b9.endDate);
    if (!q4Label || points.has(q4Label) || Number.isNaN(d.getTime())) continue;
    d.setMonth(d.getMonth() + 3);
    points.set(q4Label, {
      periodLabel: q4Label,
      endDate: d.toISOString().slice(0, 10),
      val: fyVal - b9.val,
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
    if (fyVal !== null && Number.isFinite(fyYear)) deriveQ4ForYear(fyYear, fyVal, points, ytd9);
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
  }
  const labels = [...s.rev.points.values()]
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(-12);
  const built: SecQuarterlyFinancial[] = labels.map((pt) => {
    const k = pt.periodLabel;
    const g = s.gp.points.get(k)?.val ?? null;
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
  });
  return enrichYoY(built).slice(-8);
}
