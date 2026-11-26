export type FinancialFactDuration = "instant" | "quarter" | "ytd" | "annual";
export type FinancialConceptUnitKind = "monetary" | "shares" | "perShare";

export interface FinancialConceptSpec {
  concept: string;
  labelZh: string;
  duration: "instant" | "flow";
  unitKind: FinancialConceptUnitKind;
  usGaapTags: readonly string[];
  ifrsTags: readonly string[];
}

// Format: "concept|labelZh|duration|unitKind|usGaapCsv|ifrsCsv"
const CONCEPT_ROWS: readonly string[] = [
  "revenue|营业收入|flow|monetary|RevenueFromContractWithCustomerExcludingAssessedTax,Revenues,SalesRevenueNet|Revenue",
  "cost_of_revenue|营业成本|flow|monetary|CostOfRevenue,CostOfGoodsAndServicesSold|CostOfSales",
  "gross_profit|毛利润|flow|monetary|GrossProfit|GrossProfit",
  "rd_expense|研发费用|flow|monetary|ResearchAndDevelopmentExpense|ResearchAndDevelopmentExpense",
  "sga_expense|销售及管理费用|flow|monetary|SellingGeneralAndAdministrativeExpense|AdministrativeExpense,DistributionCosts",
  "operating_income|营业利润 (EBIT)|flow|monetary|OperatingIncomeLoss|ProfitLossFromOperatingActivities",
  "da_expense|折旧与摊销 (D&A)|flow|monetary|DepreciationDepletionAndAmortization,DepreciationAndAmortization|DepreciationAndAmortisationExpense",
  "interest_expense|利息费用|flow|monetary|InterestExpense,InterestExpenseDebt|FinanceCosts",
  "pretax_income|税前利润|flow|monetary|IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest,IncomeLossBeforeIncomeTaxes|ProfitLossBeforeTax",
  "income_tax_expense|所得税费用|flow|monetary|IncomeTaxExpenseBenefit|IncomeTaxExpenseContinuingOperations,IncomeTaxExpense",
  "net_income|净利润|flow|monetary|NetIncomeLoss|ProfitLoss",
  "diluted_eps|稀释每股收益|flow|perShare|EarningsPerShareDiluted|DilutedEarningsLossPerShare",
  "diluted_shares|稀释加权股本|flow|shares|WeightedAverageNumberOfDilutedSharesOutstanding,CommonStockSharesOutstanding|AdjustedWeightedAverageShares,WeightedAverageShares",
  "operating_cash_flow|经营活动现金流|flow|monetary|NetCashProvidedByUsedInOperatingActivities|CashFlowsFromUsedInOperatingActivities",
  "capex|资本开支 (CapEx)|flow|monetary|PaymentsToAcquirePropertyPlantAndEquipment,PaymentsToAcquireProductiveAssets|PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
  "sbc|股权激励 (SBC)|flow|monetary|ShareBasedCompensation,AllocatedShareBasedCompensationExpense|ExpenseFromSharebasedPaymentTransactionsWithEmployees",
  "share_repurchases|股票回购|flow|monetary|PaymentsForRepurchaseOfCommonStock|PurchaseOfTreasuryShares",
  "dividends_paid|现金分红|flow|monetary|PaymentsOfDividends,PaymentsOfDividendsCommonStock|DividendsPaid",
  "cash_and_st_investments|现金及短期投资|instant|monetary|CashCashEquivalentsAndShortTermInvestments,CashAndCashEquivalentsAtCarryingValue|CashAndCashEquivalents",
  "accounts_receivable|应收账款|instant|monetary|AccountsReceivableNetCurrent,ReceivablesNetCurrent|TradeAndOtherCurrentReceivables",
  "inventory|存货|instant|monetary|InventoryNet,InventoryFinishedGoods|Inventories",
  "accounts_payable|应付账款|instant|monetary|AccountsPayableCurrent,AccountsPayableAndAccruedLiabilitiesCurrent|TradeAndOtherCurrentPayables",
  "total_assets|总资产|instant|monetary|Assets|Assets",
  "current_assets|流动资产|instant|monetary|AssetsCurrent|CurrentAssets",
  "current_liabilities|流动负债|instant|monetary|LiabilitiesCurrent|CurrentLiabilities",
  "total_liabilities|总负债|instant|monetary|Liabilities|Liabilities",
  "total_debt|有息负债合计|instant|monetary|LongTermDebtAndCapitalLeaseObligations,LongTermDebt|Borrowings",
  "operating_lease_liability|经营租赁负债|instant|monetary|OperatingLeaseLiability|LeaseLiabilities",
  "goodwill|商誉|instant|monetary|Goodwill|Goodwill",
  "retained_earnings|留存收益|instant|monetary|RetainedEarningsAccumulatedDeficit|RetainedEarnings",
  "stockholders_equity|股东权益|instant|monetary|StockholdersEquity,StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest|Equity",
  "minority_interest|少数股东权益|instant|monetary|MinorityInterest|NoncontrollingInterests",
];

export const CANONICAL_FINANCIAL_CONCEPTS: readonly FinancialConceptSpec[] = CONCEPT_ROWS.map(
  (row) => {
    const [
      concept = "",
      labelZh = "",
      duration = "flow",
      unitKind = "monetary",
      usGaap = "",
      ifrs = "",
    ] = row.split("|");
    return {
      concept,
      labelZh,
      duration: duration as "instant" | "flow",
      unitKind: unitKind as FinancialConceptUnitKind,
      usGaapTags: usGaap.split(","),
      ifrsTags: ifrs.split(","),
    };
  },
);

export function resolveCanonicalConcept(taxonomy: string, xbrlTag: string): string | null {
  const isIfrs = taxonomy.toLowerCase().includes("ifrs");
  for (const spec of CANONICAL_FINANCIAL_CONCEPTS) {
    const list = isIfrs ? spec.ifrsTags : spec.usGaapTags;
    if (list.includes(xbrlTag)) return spec.concept;
  }
  return null;
}
