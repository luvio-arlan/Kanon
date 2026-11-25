import { roundTo, type SecAnnualFinancial, type SecFinancialFact } from "@kanon/core";
import {
  type CurrencyNormalization,
  collectAnnualEntryMap,
  collectAnnualMap,
  formatUsdCompact,
  resolveCurrencyNormalization,
  type SecFactsPayload,
} from "./xbrl-helpers";

export { formatUsdCompact, resolveCurrencyNormalization, type SecFactsPayload };

function extractTotalDebtMap(facts: SecFactsPayload | undefined, norm: CurrencyNormalization) {
  const inst = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "instant", norm);
  const aggregate = inst(
    ["LongTermDebtAndCapitalLeaseObligations", "LongTermDebt"],
    ["Borrowings"],
  );
  const noncurrent = inst(
    ["LongTermDebtNoncurrent"],
    ["NoncurrentBorrowings", "LongtermBorrowings"],
  );
  const current = inst(
    ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
    ["CurrentBorrowings", "CurrentPortionOfLongtermBorrowings"],
  );
  const merged = new Map<number, number>(aggregate);
  for (const fy of new Set([...noncurrent.keys(), ...current.keys()])) {
    if (merged.has(fy)) continue;
    merged.set(fy, (noncurrent.get(fy) ?? 0) + (current.get(fy) ?? 0));
  }
  return merged;
}

function extractBalanceSheetMaps(facts: SecFactsPayload | undefined, norm: CurrencyNormalization) {
  const inst = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "instant", norm);
  return {
    cash: inst(
      ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue"],
      ["CashAndCashEquivalents"],
    ),
    debt: extractTotalDebtMap(facts, norm),
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

function extractCashFlowMaps(facts: SecFactsPayload | undefined, norm: CurrencyNormalization) {
  const flow = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "flow", norm);
  return {
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
  };
}

function extractIncomeCashMaps(facts: SecFactsPayload | undefined, norm: CurrencyNormalization) {
  const flow = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "flow", norm);
  const revEntries = collectAnnualEntryMap(
    facts,
    ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    ["Revenue"],
    "monetary",
    "flow",
    norm,
  );
  const niEntries = collectAnnualEntryMap(
    facts,
    ["NetIncomeLoss"],
    ["ProfitLoss"],
    "monetary",
    "flow",
    norm,
  );
  return {
    revEntries,
    niEntries,
    rev: new Map([...revEntries.entries()].map(([k, v]) => [k, v.val])),
    gp: flow(["GrossProfit"], ["GrossProfit"]),
    cogs: flow(["CostOfRevenue", "CostOfGoodsAndServicesSold"], ["CostOfSales"]),
    ebit: flow(["OperatingIncomeLoss"], ["ProfitLossFromOperatingActivities"]),
    rd: flow(["ResearchAndDevelopmentExpense"], ["ResearchAndDevelopmentExpense"]),
    ni: new Map([...niEntries.entries()].map(([k, v]) => [k, v.val])),
    ...extractCashFlowMaps(facts, norm),
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
