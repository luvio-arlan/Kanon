import { z } from "zod";

export const PortfolioRoleSchema = z.enum(["watchlist", "core", "starter", "exited"]);
export type PortfolioRole = z.infer<typeof PortfolioRoleSchema>;

export const ValuationModelModeSchema = z.enum(["pe", "ev_fcf"]);
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
  ownerFcfMultipleBase: z.number().finite().min(5).max(60).optional(),
  baseOwnerFcfB: z.number().finite().positive().optional(),
  cashB: z.number().finite().nonnegative().optional(),
  totalDebtB: z.number().finite().nonnegative().optional(),
});
export type ValuationDriverInputs = z.infer<typeof ValuationDriverInputsSchema>;

export const SecAnnualFinancialSchema = z.object({
  fiscalYear: z.string().min(1),
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
      status: z.enum(["validated", "watching", "warning"]),
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
