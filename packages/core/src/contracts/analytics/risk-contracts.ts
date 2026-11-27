import { z } from "zod";

export const RiskContributionRowSchema = z.object({
  ticker: z.string().min(1),
  weightPct: z.number().finite(),
  standaloneVolPct: z.number().finite().nullable(),
  mcrPct: z.number().finite().nullable(),
  pcrPct: z.number().finite().nullable(),
  betaVsSpy: z.number().finite().nullable(),
});
export type RiskContributionRow = z.infer<typeof RiskContributionRowSchema>;

export const CorrelationClusterSchema = z.object({
  id: z.string().min(1),
  tickers: z.array(z.string().min(1)),
  combinedWeightPct: z.number().finite(),
  avgIntraCorr: z.number().finite(),
  exceedsCap: z.boolean(),
});
export type CorrelationCluster = z.infer<typeof CorrelationClusterSchema>;

export const PortfolioRiskResponseSchema = z.object({
  status: z.enum(["ready", "insufficient_history", "empty"]),
  basis: z.enum(["daily_cov", "sector_tag"]),
  windowDays: z.number().int().min(0),
  annualizedVolPct: z.number().finite().nullable(),
  portfolioBeta: z.number().finite().nullable(),
  diversificationRatio: z.number().finite().nullable(),
  effectiveNumHoldings: z.number().finite().nullable(),
  effectiveNumBets: z.number().finite().nullable(),
  shrinkageIntensity: z.number().finite().nullable(),
  clusterCapPct: z.number().positive(),
  contributions: z.array(RiskContributionRowSchema),
  clusters: z.array(CorrelationClusterSchema),
  missingTickers: z.array(z.string()),
});
export type PortfolioRiskResponse = z.infer<typeof PortfolioRiskResponseSchema>;
