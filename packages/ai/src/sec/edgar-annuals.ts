import { roundTo, type SecAnnualFinancial, type SecFinancialFact } from "@kanon/core";
import {
  collectAnnualMap,
  diffDays,
  formatUsdCompact,
  type SecFactsPayload,
  type SecFactUnit,
  type XbrlFactsNamespace,
} from "./xbrl-helpers";

export {
  diffDays,
  formatUsdCompact,
  type SecFactsPayload,
  type SecFactUnit,
  type XbrlFactsNamespace,
};

function extractWorkingCapMaps(facts: SecFactsPayload | undefined) {
  return {
    inventory: collectAnnualMap(
      facts,
      ["InventoryNet", "InventoryFinishedGoods"],
      ["Inventories"],
      "USD",
      "instant",
    ),
    receivables: collectAnnualMap(
      facts,
      ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
      ["TradeAndOtherCurrentReceivables"],
      "USD",
      "instant",
    ),
    payables: collectAnnualMap(
      facts,
      ["AccountsPayableCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent"],
      ["TradeAndOtherCurrentPayables"],
      "USD",
      "instant",
    ),
    shares: collectAnnualMap(
      facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "CommonStockSharesOutstanding"],
      ["AdjustedWeightedAverageShares"],
      "shares",
      "flow",
    ),
  };
}

function extractBalanceSheetMaps(facts: SecFactsPayload | undefined) {
  return {
    cash: collectAnnualMap(
      facts,
      ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments"],
      ["CashAndCashEquivalents"],
      "USD",
      "instant",
    ),
    debt: collectAnnualMap(
      facts,
      ["LongTermDebtAndCapitalLeaseObligations", "LongTermDebt", "DebtCurrent"],
      ["NoncurrentLiabilities", "Borrowings"],
      "USD",
      "instant",
    ),
    equity: collectAnnualMap(
      facts,
      [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ],
      ["Equity"],
      "USD",
      "instant",
    ),
    ...extractWorkingCapMaps(facts),
  };
}

function extractIncomeCashMaps(facts: SecFactsPayload | undefined) {
  return {
    rev: collectAnnualMap(
      facts,
      ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
      ["Revenue"],
    ),
    gp: collectAnnualMap(facts, ["GrossProfit"], ["GrossProfit"]),
    cogs: collectAnnualMap(facts, ["CostOfRevenue", "CostOfGoodsAndServicesSold"], ["CostOfSales"]),
    ebit: collectAnnualMap(facts, ["OperatingIncomeLoss"], ["ProfitLossFromOperatingActivities"]),
    rd: collectAnnualMap(
      facts,
      ["ResearchAndDevelopmentExpense"],
      ["ResearchAndDevelopmentExpense"],
    ),
    ni: collectAnnualMap(facts, ["NetIncomeLoss"], ["ProfitLoss"]),
    ocf: collectAnnualMap(
      facts,
      ["NetCashProvidedByUsedInOperatingActivities"],
      ["CashFlowsFromUsedInOperatingActivities"],
    ),
    capex: collectAnnualMap(
      facts,
      ["PaymentsToAcquirePropertyPlantAndEquipment"],
      ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    ),
    buybacks: collectAnnualMap(
      facts,
      ["PaymentsForRepurchaseOfCommonStock"],
      ["PurchaseOfTreasuryShares"],
    ),
    dividends: collectAnnualMap(
      facts,
      ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
      ["DividendsPaid"],
    ),
    sbc: collectAnnualMap(
      facts,
      ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
      ["ExpenseFromSharebasedPaymentTransactionsWithEmployees"],
    ),
    eps: collectAnnualMap(
      facts,
      ["EarningsPerShareDiluted"],
      ["DilutedEarningsLossPerShare"],
      "USD/shares",
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
  const g = readYearVal(ic.gp, fy);
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
    costOfRevenue: readYearVal(ic.cogs, fy),
    accountsPayable: readYearVal(bs.payables, fy),
    shareRepurchases: readYearVal(ic.buybacks, fy),
    dividendsPaid: readYearVal(ic.dividends, fy),
  };
}

export function extractAnnualHistory(facts: SecFactsPayload | undefined): SecAnnualFinancial[] {
  const ic = extractIncomeCashMaps(facts);
  const bs = extractBalanceSheetMaps(facts);
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
