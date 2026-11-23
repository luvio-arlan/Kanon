import { roundTo, type SecAnnualFinancial, type SecFinancialFact } from "@kanon/core";

export interface SecFactUnit {
  val?: number;
  form?: string;
  fy?: number;
  end?: string;
}

export type UsGaapFacts = Record<
  string,
  { units?: { USD?: SecFactUnit[]; "USD/shares"?: SecFactUnit[] } }
>;

export function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function isAnnualRow(row: SecFactUnit): row is { val: number; fy: number; end?: string } {
  const annualForm = row.form === "10-K" || row.form === "20-F";
  return annualForm && typeof row.val === "number" && typeof row.fy === "number";
}

function indexUnitRows(list: readonly SecFactUnit[]): Map<number, number> {
  const byYear = new Map<number, { end: string; val: number }>();
  for (const row of list) {
    if (!isAnnualRow(row)) continue;
    const prev = byYear.get(row.fy);
    const end = row.end ?? "";
    if (!prev || end > prev.end) {
      byYear.set(row.fy, { end, val: row.val });
    }
  }
  return new Map([...byYear.entries()].map(([fy, v]) => [fy, v.val]));
}

function collectAnnualMap(
  gaap: UsGaapFacts | undefined,
  tags: readonly string[],
  unitKey: "USD" | "USD/shares" = "USD",
): Map<number, number> {
  if (!gaap) return new Map();
  for (const tag of tags) {
    const list = gaap[tag]?.units?.[unitKey];
    if (!list) continue;
    const map = indexUnitRows(list);
    if (map.size > 0) return map;
  }
  return new Map();
}

export function extractAnnualHistory(gaap: UsGaapFacts | undefined): SecAnnualFinancial[] {
  const rev = collectAnnualMap(gaap, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ]);
  const gp = collectAnnualMap(gaap, ["GrossProfit"]);
  const ni = collectAnnualMap(gaap, ["NetIncomeLoss"]);
  const ocf = collectAnnualMap(gaap, ["NetCashProvidedByUsedInOperatingActivities"]);
  const capex = collectAnnualMap(gaap, ["PaymentsToAcquirePropertyPlantAndEquipment"]);
  const eps = collectAnnualMap(gaap, ["EarningsPerShareDiluted"], "USD/shares");

  const years = [...new Set([...rev.keys(), ...ni.keys()])].sort((a, b) => a - b).slice(-5);
  return years.map((fy) => {
    const r = rev.get(fy) ?? null;
    const g = gp.get(fy) ?? null;
    const o = ocf.get(fy) ?? null;
    const c = capex.get(fy) ?? null;
    return {
      fiscalYear: `FY${fy}`,
      revenue: r,
      grossProfit: g,
      grossMarginPct: r && r > 0 && g !== null ? roundTo((g / r) * 100, 1) : null,
      netIncome: ni.get(fy) ?? null,
      operatingCashFlow: o,
      capex: c,
      freeCashFlow: o !== null && c !== null ? o - Math.abs(c) : null,
      dilutedEps: eps.get(fy) ?? null,
    };
  });
}

function makeFact(
  metric: string,
  label: string,
  val: number,
  period: string,
  sourceTag: string,
): SecFinancialFact {
  return { metric, label, valueFormatted: formatUsdCompact(val), period, sourceTag };
}

export function summarizeLatestFacts(annuals: readonly SecAnnualFinancial[]): SecFinancialFact[] {
  const latest = annuals[annuals.length - 1];
  if (!latest) return [];
  const list: SecFinancialFact[] = [];
  if (latest.revenue !== null) {
    list.push(
      makeFact("Revenue", "年度营业收入", latest.revenue, latest.fiscalYear, "us-gaap:Revenues"),
    );
  }
  if (latest.grossProfit !== null) {
    list.push(
      makeFact(
        "GrossProfit",
        "年度毛利润",
        latest.grossProfit,
        latest.fiscalYear,
        "us-gaap:GrossProfit",
      ),
    );
  }
  if (latest.freeCashFlow !== null) {
    list.push(
      makeFact(
        "FreeCashFlow",
        "年度自由现金流",
        latest.freeCashFlow,
        latest.fiscalYear,
        "us-gaap:FCF",
      ),
    );
  } else if (latest.netIncome !== null) {
    list.push(
      makeFact(
        "NetIncome",
        "年度净利润",
        latest.netIncome,
        latest.fiscalYear,
        "us-gaap:NetIncomeLoss",
      ),
    );
  }
  return list;
}
