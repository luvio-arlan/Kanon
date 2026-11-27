import { extractOperatingLeaseMap, extractTotalDebtMap } from "../xbrl-balance-helpers";
import {
  type CurrencyNormalization,
  collectAnnualEntryMap,
  collectAnnualMap,
  type SecFactsPayload,
} from "../xbrl-helpers";

const PRETAX_US_TAGS = [
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  "IncomeLossBeforeIncomeTaxes",
] as const;

const REV_US_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
] as const;

function mergeTotalLiabilities(
  direct: Map<number, number>,
  liabAndEq: Map<number, number>,
  equity: Map<number, number>,
): Map<number, number> {
  const out = new Map(direct);
  for (const [fy, total] of liabAndEq.entries()) {
    if (out.has(fy)) continue;
    const eqVal = equity.get(fy);
    if (eqVal != null) out.set(fy, total - eqVal);
  }
  return out;
}

function extractWorkingCapitalMaps(
  inst: (us: readonly string[], ifrs: readonly string[]) => Map<number, number>,
) {
  return {
    totalAssets: inst(["Assets"], ["Assets"]),
    currentAssets: inst(["AssetsCurrent"], ["CurrentAssets"]),
    currentLiabilities: inst(["LiabilitiesCurrent"], ["CurrentLiabilities"]),
    retainedEarnings: inst(["RetainedEarningsAccumulatedDeficit"], ["RetainedEarnings"]),
    ppeNet: inst(
      [
        "PropertyPlantAndEquipmentNet",
        "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
      ],
      ["PropertyPlantAndEquipment"],
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
  };
}

export function extractBalanceSheetMaps(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization,
) {
  const inst = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "instant", norm);
  const equity = inst(
    [
      "StockholdersEquity",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    ["Equity"],
  );
  const totalLiabilities = mergeTotalLiabilities(
    inst(["Liabilities"], ["Liabilities"]),
    inst(["LiabilitiesAndStockholdersEquity"], ["EquityAndLiabilities"]),
    equity,
  );
  return {
    cash: inst(
      ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue"],
      ["CashAndCashEquivalents"],
    ),
    debt: extractTotalDebtMap(facts, norm),
    leases: extractOperatingLeaseMap(facts, norm),
    goodwill: inst(["Goodwill"], ["Goodwill"]),
    equity,
    totalLiabilities,
    ...extractWorkingCapitalMaps(inst),
    shares: collectAnnualMap(
      facts,
      ["WeightedAverageNumberOfDilutedSharesOutstanding", "CommonStockSharesOutstanding"],
      ["AdjustedWeightedAverageShares", "WeightedAverageShares"],
      "shares",
      "flow",
      norm,
    ),
    sharesOutstanding: collectAnnualMap(
      facts,
      ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"],
      ["NumberOfSharesIssued"],
      "shares",
      "instant",
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

function extractSgaMap(
  flow: (us: readonly string[], ifrs: readonly string[]) => Map<number, number>,
): Map<number, number> {
  const direct = flow(
    ["SellingGeneralAndAdministrativeExpense"],
    ["SellingGeneralAndAdministrativeExpense"],
  );
  if (direct.size > 0) return direct;
  const dist = flow([], ["DistributionCosts"]);
  const admin = flow([], ["AdministrativeExpense"]);
  const combined = new Map<number, number>();
  for (const fy of new Set([...dist.keys(), ...admin.keys()])) {
    combined.set(fy, (dist.get(fy) ?? 0) + (admin.get(fy) ?? 0));
  }
  return combined;
}

function extractCoreOperatingMaps(
  flow: (us: readonly string[], ifrs: readonly string[]) => Map<number, number>,
) {
  return {
    gp: flow(["GrossProfit"], ["GrossProfit"]),
    cogs: flow(["CostOfRevenue", "CostOfGoodsAndServicesSold"], ["CostOfSales"]),
    ebit: flow(["OperatingIncomeLoss"], ["ProfitLossFromOperatingActivities"]),
    pretax: flow(PRETAX_US_TAGS, ["ProfitLossBeforeTax"]),
    tax: flow(
      ["IncomeTaxExpenseBenefit"],
      ["IncomeTaxExpenseContinuingOperations", "IncomeTaxExpense"],
    ),
    rd: flow(["ResearchAndDevelopmentExpense"], ["ResearchAndDevelopmentExpense"]),
    depreciation: flow(
      ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
      ["DepreciationAndAmortisationExpense", "DepreciationExpense"],
    ),
    sga: extractSgaMap(flow),
  };
}

export function extractIncomeCashMaps(
  facts: SecFactsPayload | undefined,
  norm: CurrencyNormalization,
) {
  const flow = (us: readonly string[], ifrs: readonly string[]) =>
    collectAnnualMap(facts, us, ifrs, "monetary", "flow", norm);
  const revEntries = collectAnnualEntryMap(
    facts,
    REV_US_TAGS,
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
    ni: new Map([...niEntries.entries()].map(([k, v]) => [k, v.val])),
    ...extractCoreOperatingMaps(flow),
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
