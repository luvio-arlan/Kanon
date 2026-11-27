import { roundTo, type SecAnnualFinancial, type SecFinancialFact } from "@kanon/core";
import { extractBalanceSheetMaps, extractIncomeCashMaps } from "./annuals/extract-maps";
import {
  type CurrencyNormalization,
  formatUsdCompact,
  resolveCurrencyNormalization,
  type SecFactsPayload,
} from "./xbrl-helpers";

export { formatUsdCompact, resolveCurrencyNormalization, type SecFactsPayload };

function readYearVal(map: Map<number, number>, fy: number): number | null {
  return map.get(fy) ?? null;
}

function buildAnnualRow(
  fy: number,
  ic: ReturnType<typeof extractIncomeCashMaps>,
  bs: ReturnType<typeof extractBalanceSheetMaps>,
): SecAnnualFinancial {
  const r = readYearVal(ic.rev, fy);
  const cogs = readYearVal(ic.cogs, fy);
  const g = readYearVal(ic.gp, fy) ?? (r !== null && cogs !== null ? r - cogs : null);
  const o = readYearVal(ic.ocf, fy);
  const c = readYearVal(ic.capex, fy);
  const endDate = ic.revEntries.get(fy)?.end || ic.niEntries.get(fy)?.end || undefined;
  return {
    fiscalYear: `FY${fy}`,
    ...(endDate ? { periodEndDate: endDate } : {}),
    revenue: r,
    grossProfit: g,
    grossMarginPct: r && r > 0 && g !== null ? roundTo((g / r) * 100, 1) : null,
    operatingIncome: readYearVal(ic.ebit, fy),
    rdExpense: readYearVal(ic.rd, fy),
    netIncome: readYearVal(ic.ni, fy),
    operatingCashFlow: o,
    capex: c,
    sbc: readYearVal(ic.sbc, fy),
    freeCashFlow: o !== null && c !== null ? o - Math.abs(c) : null,
    dilutedEps: readYearVal(ic.eps, fy),
    dilutedShares: readYearVal(bs.shares, fy),
    cashAndEquiv: readYearVal(bs.cash, fy),
    totalDebt: readYearVal(bs.debt, fy),
    stockholdersEquity: readYearVal(bs.equity, fy),
    inventory: readYearVal(bs.inventory, fy),
    accountsReceivable: readYearVal(bs.receivables, fy),
    costOfRevenue: cogs,
    accountsPayable: readYearVal(bs.payables, fy),
    shareRepurchases: readYearVal(ic.buybacks, fy),
    dividendsPaid: readYearVal(ic.dividends, fy),
    pretaxIncome: readYearVal(ic.pretax, fy),
    incomeTaxExpense: readYearVal(ic.tax, fy),
    operatingLeaseLiability: readYearVal(bs.leases, fy),
    goodwill: readYearVal(bs.goodwill, fy),
    totalAssets: readYearVal(bs.totalAssets, fy),
    currentAssets: readYearVal(bs.currentAssets, fy),
    currentLiabilities: readYearVal(bs.currentLiabilities, fy),
    totalLiabilities: readYearVal(bs.totalLiabilities, fy),
    retainedEarnings: readYearVal(bs.retainedEarnings, fy),
    ppeNet: readYearVal(bs.ppeNet, fy),
    depreciation: readYearVal(ic.depreciation, fy),
    sgaExpense: readYearVal(ic.sga, fy),
    sharesOutstanding: readYearVal(bs.sharesOutstanding, fy),
  };
}

export function extractAnnualHistory(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization = resolveCurrencyNormalization(facts),
): SecAnnualFinancial[] {
  const ic = extractIncomeCashMaps(facts, norm);
  const bs = extractBalanceSheetMaps(facts, norm);
  const years = [...new Set([...ic.rev.keys(), ...ic.ni.keys()])].sort((a, b) => a - b).slice(-5);
  return years.map((fy) => buildAnnualRow(fy, ic, bs));
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
