import { roundTo, type SecAnnualFinancial, type SecFinancialFact } from "@kanon/core";
import {
  type CurrencyNormalization,
  collectAnnualMap,
  formatUsdCompact,
  resolveCurrencyNormalization,
  type SecFactsPayload,
} from "./xbrl-helpers";

export { formatUsdCompact, resolveCurrencyNormalization, type SecFactsPayload };

function extractBalanceSheetMaps(facts: SecFactsPayload | undefined, norm: CurrencyNormalization) {
  const inst = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "instant", norm);
  return {
    cash: inst(
      ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue"],
      ["CashAndCashEquivalents"],
    ),
    debt: inst(
      [
        "LongTermDebtAndCapitalLeaseObligations",
        "LongTermDebt",
        "LongTermDebtNoncurrent",
        "DebtCurrent",
      ],
      ["Borrowings", "LongtermBorrowings"],
    ),
    equity: inst(
      [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ],
      ["Equity"],
    ),
    inventory: inst(["InventoryNet", "InventoryFinishedGoods"], ["Inventories"]),
    receivables: inst(
      ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
      ["TradeAndOtherCurrentReceivables"],
    ),
    payables: inst(
      ["AccountsPayableCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent"],
      ["TradeAndOtherCurrentPayables"],
    ),
    shares: collectAnnualMap(
      facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "CommonStockSharesOutstanding"],
      ["AdjustedWeightedAverageShares", "WeightedAverageShares"],
      "shares",
      "flow",
      norm,
    ),
  };
}

function extractIncomeCashMaps(facts: SecFactsPayload | undefined, norm: CurrencyNormalization) {
  const flow = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "flow", norm);
  return {
    rev: flow(
      ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
      ["Revenue"],
    ),
    gp: flow(["GrossProfit"], ["GrossProfit"]),
    cogs: flow(["CostOfRevenue", "CostOfGoodsAndServicesSold"], ["CostOfSales"]),
    ebit: flow(["OperatingIncomeLoss"], ["ProfitLossFromOperatingActivities"]),
    rd: flow(["ResearchAndDevelopmentExpense"], ["ResearchAndDevelopmentExpense"]),
    ni: flow(["NetIncomeLoss"], ["ProfitLoss"]),
    ocf: flow(
      ["NetCashProvidedByUsedInOperatingActivities"],
      ["CashFlowsFromUsedInOperatingActivities"],
    ),
    capex: flow(
      ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
      ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    ),
    buybacks: flow(["PaymentsForRepurchaseOfCommonStock"], ["PurchaseOfTreasuryShares"]),
    dividends: flow(["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"], ["DividendsPaid"]),
    sbc: flow(
      ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
      ["ExpenseFromSharebasedPaymentTransactionsWithEmployees"],
    ),
    eps: collectAnnualMap(
      facts,
      ["EarningsPerShareDiluted"],
      ["DilutedEarningsLossPerShare"],
      "perShare",
      "flow",
      norm,
    ),
  };
}

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
  return {
    fiscalYear: `FY${fy}`,
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
