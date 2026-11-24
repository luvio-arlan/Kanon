import { roundTo, type SecQuarterlyFinancial } from "@kanon/core";
import {
  diffDays,
  type SecFactsPayload,
  type SecFactUnit,
  type XbrlFactsNamespace,
} from "./edgar-annuals";

interface QuarterPoint {
  periodLabel: string;
  endDate: string;
  val: number;
}

const QUARTER_FRAME_RE = /^CY(\d{4})Q([1-4])$/;

function parseQuarterLabel(row: SecFactUnit): string | null {
  if (row.frame) {
    const m = QUARTER_FRAME_RE.exec(row.frame);
    if (m?.[1] && m[2]) return `${m[1]} Q${m[2]}`;
  }
  if (!row.end) return null;
  const year = row.end.slice(0, 4);
  const month = Number(row.end.slice(5, 7));
  if (!Number.isFinite(month)) return null;
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `${year} Q${q}`;
}

function isStandaloneQuarter(
  row: SecFactUnit,
): row is { val: number; end: string; frame?: string } {
  if (typeof row.val !== "number" || !row.end) return false;
  if (row.form !== "10-Q" && row.form !== "10-K" && row.form !== "6-K") return false;
  if (row.frame && QUARTER_FRAME_RE.test(row.frame)) return true;
  const days = diffDays(row.start, row.end);
  return days !== null && days >= 70 && days <= 115;
}

function indexQuarterRows(list: readonly SecFactUnit[]): Map<string, QuarterPoint> {
  const map = new Map<string, QuarterPoint>();
  for (const row of list) {
    if (!isStandaloneQuarter(row)) continue;
    const label = parseQuarterLabel(row);
    if (!label) continue;
    const prev = map.get(label);
    if (!prev || row.end > prev.endDate) {
      map.set(label, { periodLabel: label, endDate: row.end, val: row.val });
    }
  }
  return map;
}

function collectQuarterMap(
  facts: SecFactsPayload | undefined,
  usTags: readonly string[],
  ifrsTags: readonly string[] = [],
  unitKey: "USD" | "USD/shares" = "USD",
): Map<string, QuarterPoint> {
  const tryNs = (ns: XbrlFactsNamespace | undefined, tags: readonly string[]) => {
    if (!ns) return new Map<string, QuarterPoint>();
    for (const tag of tags) {
      const list = ns[tag]?.units?.[unitKey];
      if (!list) continue;
      const map = indexQuarterRows(list);
      if (map.size > 0) return map;
    }
    return new Map<string, QuarterPoint>();
  };
  const us = tryNs(facts?.["us-gaap"], usTags);
  return us.size > 0 ? us : tryNs(facts?.["ifrs-full"], ifrsTags);
}

function enrichYoY(rows: SecQuarterlyFinancial[]): SecQuarterlyFinancial[] {
  return rows.map((row, idx) => {
    const prevYear = idx >= 4 ? rows[idx - 4] : undefined;
    const revYoY =
      prevYear?.revenue && prevYear.revenue > 0 && row.revenue !== null
        ? roundTo(((row.revenue - prevYear.revenue) / prevYear.revenue) * 100, 1)
        : null;
    const gmYoY =
      prevYear?.grossMarginPct !== null &&
      prevYear?.grossMarginPct !== undefined &&
      row.grossMarginPct !== null
        ? Math.round((row.grossMarginPct - prevYear.grossMarginPct) * 100)
        : null;
    return { ...row, revenueYoYPct: revYoY, grossMarginYoYBps: gmYoY };
  });
}

export function extractQuarterlyHistory(
  facts: SecFactsPayload | undefined,
): SecQuarterlyFinancial[] {
  const rev = collectQuarterMap(
    facts,
    ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    ["Revenue"],
  );
  const gp = collectQuarterMap(facts, ["GrossProfit"], ["GrossProfit"]);
  const ebit = collectQuarterMap(
    facts,
    ["OperatingIncomeLoss"],
    ["ProfitLossFromOperatingActivities"],
  );
  const ni = collectQuarterMap(facts, ["NetIncomeLoss"], ["ProfitLoss"]);
  const ocf = collectQuarterMap(facts, ["NetCashProvidedByUsedInOperatingActivities"]);
  const capex = collectQuarterMap(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"]);
  const eps = collectQuarterMap(
    facts,
    ["EarningsPerShareDiluted"],
    ["DilutedEarningsLossPerShare"],
    "USD/shares",
  );

  const labels = [...rev.values()].sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(-12);

  const built: SecQuarterlyFinancial[] = labels.map((pt) => {
    const k = pt.periodLabel;
    const r = pt.val;
    const g = gp.get(k)?.val ?? null;
    const o = ocf.get(k)?.val ?? null;
    const c = capex.get(k)?.val ?? null;
    return {
      periodLabel: k,
      endDate: pt.endDate,
      revenue: r,
      grossProfit: g,
      grossMarginPct: r > 0 && g !== null ? roundTo((g / r) * 100, 1) : null,
      operatingIncome: ebit.get(k)?.val ?? null,
      netIncome: ni.get(k)?.val ?? null,
      freeCashFlow: o !== null && c !== null ? o - Math.abs(c) : null,
      dilutedEps: eps.get(k)?.val ?? null,
      revenueYoYPct: null,
      grossMarginYoYBps: null,
    };
  });

  return enrichYoY(built).slice(-8);
}
