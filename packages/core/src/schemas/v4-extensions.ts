import { z } from "zod";
import { HypothesisStatusSchema } from "./thesis";
import {
  LinkedOperatingDriversSchema,
  ReportingCurrencySchema,
  SecInsiderSummarySchema,
  SotpSegmentSchema,
} from "./v7-research-os";

export const PortfolioRoleSchema = z.enum(["watchlist", "core", "starter", "exited"]);
export type PortfolioRole = z.infer<typeof PortfolioRoleSchema>;

export const ValuationModelModeSchema = z.enum(["pe", "ev_fcf", "ev_ebit", "sotp"]);
export type ValuationModelMode = z.infer<typeof ValuationModelModeSchema>;

export const ValuationDriverInputsSchema = z.object({
  currentRevenueB: z.number().finite().positive().optional(),
  revenueCagrPct: z.number().finite().min(-30).max(100).optional(),
  targetNetMarginPct: z.number().finite().min(-50).max(80).optional(),
  dilutedSharesM: z.number().finite().positive().optional(),
  annualShareChangePct: z.number().finite().min(-15).max(15).optional(),
  dividendYieldPct: z.number().finite().min(0).max(15).optional(),
  hurdleRatePct: z.number().finite().min(5).max(30).optional(),
  terminalMultiple: z.number().finite().min(5).max(50).optional(),
  ronicPct: z.number().finite().min(5).max(120).optional(),
  ownerFcfMultipleBase: z.number().finite().min(5).max(60).optional(),
  baseOwnerFcfB: z.number().finite().positive().optional(),
  cashB: z.number().finite().nonnegative().optional(),
  totalDebtB: z.number().finite().nonnegative().optional(),
  linkedDrivers: LinkedOperatingDriversSchema.optional(),
  sotpSegments: z.array(SotpSegmentSchema).max(8).optional(),
  sotpHoldingDiscountPct: z.number().finite().min(0).max(40).optional(),
});
export type ValuationDriverInputs = z.infer<typeof ValuationDriverInputsSchema>;

export const SecAnnualFinancialSchema = z.object({
  fiscalYear: z.string().min(1),
  periodEndDate: z.string().optional(),
  revenue: z.number().nullable(),
  grossProfit: z.number().nullable(),
  grossMarginPct: z.number().nullable(),
  operatingIncome: z.number().nullable().optional(),
  rdExpense: z.number().nullable().optional(),
  netIncome: z.number().nullable(),
  operatingCashFlow: z.number().nullable(),
  capex: z.number().nullable(),
  sbc: z.number().nullable().optional(),
  freeCashFlow: z.number().nullable(),
  dilutedEps: z.number().nullable(),
  dilutedShares: z.number().nullable().optional(),
  cashAndEquiv: z.number().nullable().optional(),
  totalDebt: z.number().nullable().optional(),
  stockholdersEquity: z.number().nullable().optional(),
  inventory: z.number().nullable().optional(),
  accountsReceivable: z.number().nullable().optional(),
  costOfRevenue: z.number().nullable().optional(),
  accountsPayable: z.number().nullable().optional(),
  shareRepurchases: z.number().nullable().optional(),
  dividendsPaid: z.number().nullable().optional(),
  pretaxIncome: z.number().nullable().optional(),
  incomeTaxExpense: z.number().nullable().optional(),
  operatingLeaseLiability: z.number().nullable().optional(),
  goodwill: z.number().nullable().optional(),
  totalAssets: z.number().nullable().optional(),
  currentAssets: z.number().nullable().optional(),
  currentLiabilities: z.number().nullable().optional(),
  totalLiabilities: z.number().nullable().optional(),
  retainedEarnings: z.number().nullable().optional(),
  ppeNet: z.number().nullable().optional(),
  depreciation: z.number().nullable().optional(),
  sgaExpense: z.number().nullable().optional(),
  sharesOutstanding: z.number().nullable().optional(),
});
export type SecAnnualFinancial = z.infer<typeof SecAnnualFinancialSchema>;

export const SecQuarterlyFinancialSchema = z.object({
  periodLabel: z.string().min(1),
  endDate: z.string().min(1),
  revenue: z.number().nullable(),
  grossProfit: z.number().nullable(),
  grossMarginPct: z.number().nullable(),
  operatingIncome: z.number().nullable(),
  netIncome: z.number().nullable(),
  freeCashFlow: z.number().nullable(),
  dilutedEps: z.number().nullable(),
  revenueYoYPct: z.number().nullable(),
  grossMarginYoYBps: z.number().nullable(),
});
export type SecQuarterlyFinancial = z.infer<typeof SecQuarterlyFinancialSchema>;

export const RevisionSnapshotSchema = z.object({
  currentPrice: z.number(),
  bearTarget: z.number(),
  baseTarget: z.number(),
  bullTarget: z.number(),
  baseEps: z.number(),
  basePe: z.number(),
  riskRewardRatio: z.number().nullable(),
  readinessScore: z.number().int(),
  hypotheses: z.array(
    z.object({
      title: z.string(),
      status: HypothesisStatusSchema,
      threshold: z.string(),
    }),
  ),
});
export type RevisionSnapshot = z.infer<typeof RevisionSnapshotSchema>;

export const HypothesisVerdictItemSchema = z.object({
  hypothesisId: z.string().min(1),
  title: z.string().min(1),
  verdict: z.enum(["strengthened", "unchanged", "weakened"]),
  evidence: z.string().min(1),
});
export type HypothesisVerdictItem = z.infer<typeof HypothesisVerdictItemSchema>;

export const QuarterlyReviewSchema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  quarterLabel: z.string().min(2).max(30),
  summary: z.string().min(6),
  hypothesisVerdicts: z.array(HypothesisVerdictItemSchema).min(1),
  priceAtReview: z.number().finite().positive(),
  baseTargetAtReview: z.number().finite().positive(),
  createdAt: z.string().min(1),
});
export type QuarterlyReview = z.infer<typeof QuarterlyReviewSchema>;

export const CreateQuarterlyReviewSchema = z.object({
  quarterLabel: z.string().trim().min(2).max(30),
  summary: z.string().trim().min(6),
  hypothesisVerdicts: z.array(HypothesisVerdictItemSchema).min(1),
  applyStatusUpdates: z.boolean().default(true),
});
export type CreateQuarterlyReviewInput = z.infer<typeof CreateQuarterlyReviewSchema>;

export const InboundCrossCheckSchema = z.object({
  id: z.string().min(1),
  sourceThesisId: z.string().min(1),
  sourceTicker: z.string().min(1),
  sourceCompanyName: z.string().min(1),
  peerRole: z.enum(["upstream", "downstream", "competitor", "primary"]),
  topic: z.string().min(1),
  sourceAnchor: z.string().min(1),
  statement: z.string().min(1),
  alignment: z.enum(["aligned", "divergent", "pending"]),
  takeaway: z.string().min(1),
});
export type InboundCrossCheck = z.infer<typeof InboundCrossCheckSchema>;

function isSafeSecDocumentUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host === "www.sec.gov" || host === "sec.gov");
  } catch (err) {
    void err;
    return false;
  }
}

export const SecFilingItemSchema = z.object({
  form: z.string().min(1).max(20),
  filingDate: z.string().min(1).max(32),
  reportDate: z.string().max(32),
  accessionNumber: z.string().min(1).max(40),
  documentUrl: z
    .string()
    .url()
    .refine(isSafeSecDocumentUrl, "SEC 原文链接必须指向 https://www.sec.gov"),
  description: z.string().max(300),
});
export type SecFilingItem = z.infer<typeof SecFilingItemSchema>;

export const SecFinancialFactSchema = z.object({
  metric: z.string().min(1),
  label: z.string().min(1),
  valueFormatted: z.string().min(1),
  period: z.string().min(1),
  sourceTag: z.string().min(1),
});
export type SecFinancialFact = z.infer<typeof SecFinancialFactSchema>;

export const SecSnapshotSchema = z.object({
  ticker: z.string().min(1),
  cik: z.string().min(1),
  entityName: z.string().min(1),
  source: z.enum(["sec-edgar-live", "cached-seed", "manual-verified"]),
  reportingCurrency: z.string().min(2).max(8).optional(),
  fxToUsd: z.number().finite().positive().optional(),
  adrRatio: z.number().finite().positive().optional(),
  sicCode: z.string().max(12).optional(),
  fetchedAt: z.string().min(1),
  filings: z.array(SecFilingItemSchema),
  facts: z.array(SecFinancialFactSchema),
  annuals: z.array(SecAnnualFinancialSchema).default([]),
  quarterlies: z.array(SecQuarterlyFinancialSchema).default([]),
  insiderSummary: SecInsiderSummarySchema.nullable().optional(),
});
export type SecSnapshot = z.infer<typeof SecSnapshotSchema>;

export const UpsertManualSecSnapshotSchema = z.object({
  entityName: z.string().trim().min(1).max(80),
  reportingCurrency: ReportingCurrencySchema.default("USD"),
  fxToUsd: z.number().finite().positive().max(100).default(1),
  adrRatio: z.number().finite().positive().max(100).default(1),
  annuals: z.array(SecAnnualFinancialSchema).min(1).max(10),
});
export type UpsertManualSecSnapshotInput = z.input<typeof UpsertManualSecSnapshotSchema>;
