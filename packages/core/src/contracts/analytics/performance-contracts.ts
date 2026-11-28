import { z } from "zod";
import { IsoDateSchema } from "../intel/primitives";

export const NavBasisSchema = z.enum(["full_bars", "partial_bars", "cost_fallback"]);
export type NavBasis = z.infer<typeof NavBasisSchema>;

export const NavPointSchema = z.object({
  date: IsoDateSchema,
  nav: z.number().finite(),
  cash: z.number().finite(),
  equityValue: z.number().finite(),
  netFlow: z.number().finite(),
  twrCumPct: z.number().finite().nullable(),
  spyTrCumPct: z.number().finite().nullable(),
  drawdownPct: z.number().finite().nullable(),
  basis: NavBasisSchema,
});
export type NavPoint = z.infer<typeof NavPointSchema>;

export const UnrecordedDividendSchema = z.object({
  ticker: z.string().min(1),
  exDate: IsoDateSchema,
  perShare: z.number().positive(),
  sharesOnExDate: z.number().positive(),
  estimatedTotal: z.number().positive(),
});
export type UnrecordedDividend = z.infer<typeof UnrecordedDividendSchema>;

export const PortfolioPerformanceResponseSchema = z.object({
  accountId: z.string().nullable(),
  status: z.enum(["ready", "empty", "insufficient_bars", "no_account"]),
  totalNav: z.number().finite().nullable(),
  cashBalance: z.number().finite().nullable(),
  equityValue: z.number().finite().nullable(),
  twrPct: z.number().finite().nullable(),
  modifiedDietzPct: z.number().finite().nullable(),
  annualizedTwrPct: z.number().finite().nullable(),
  spyTrPct: z.number().finite().nullable(),
  excessReturnPct: z.number().finite().nullable(),
  maxDrawdownPct: z.number().finite().nullable(),
  maxDrawdownPeakDate: IsoDateSchema.nullable(),
  maxDrawdownTroughDate: IsoDateSchema.nullable(),
  currentDrawdownPct: z.number().finite().nullable(),
  tradingDays: z.number().int().min(0),
  basis: z.enum(["full_bars", "partial_bars", "cost_fallback", "rebase_pending", "empty"]),
  series: z.array(NavPointSchema),
  unrecordedDividends: z.array(UnrecordedDividendSchema),
});
export type PortfolioPerformanceResponse = z.infer<typeof PortfolioPerformanceResponseSchema>;
