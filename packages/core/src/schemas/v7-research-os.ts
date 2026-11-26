import { z } from "zod";

export const HypothesisKpiMetricSchema = z.enum([
  "grossMarginPct",
  "revenueCagrPct",
  "roicPct",
  "fcfConversionPct",
  "sbcPctOfOcf",
  "netCashB",
]);
export type HypothesisKpiMetric = z.infer<typeof HypothesisKpiMetricSchema>;

export const HypothesisKpiOperatorSchema = z.enum([">=", "<=", ">", "<"]);
export type HypothesisKpiOperator = z.infer<typeof HypothesisKpiOperatorSchema>;

export const HypothesisKpiRuleSchema = z.object({
  metricKey: HypothesisKpiMetricSchema,
  operator: HypothesisKpiOperatorSchema,
  targetValue: z.number().finite().min(-500).max(100_000),
});
export type HypothesisKpiRule = z.infer<typeof HypothesisKpiRuleSchema>;

export const SotpSegmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  metricLabel: z.string().trim().min(1).max(24).default("EBIT"),
  metricValueB: z.number().finite().min(0).max(10_000),
  bearMultiple: z.number().finite().min(0).max(200),
  baseMultiple: z.number().finite().min(0).max(200),
  bullMultiple: z.number().finite().min(0).max(200),
});
export type SotpSegment = z.infer<typeof SotpSegmentSchema>;

export const OperatingCaseDriversSchema = z.object({
  revenueCagrPct: z.number().finite().min(-40).max(120),
  targetOperatingMarginPct: z.number().finite().min(-40).max(85),
  sbcPctOfRev: z.number().finite().min(0).max(40).default(2.5),
  taxRatePct: z.number().finite().min(0).max(45).default(18),
  capexPctOfRev: z.number().finite().min(0).max(60).default(8),
  daPctOfRev: z.number().finite().min(0).max(40).optional(),
  maintenanceCapexPctOfRev: z.number().finite().min(0).max(60).optional(),
  nwcPctOfIncrementalRev: z.number().finite().min(-30).max(50).optional(),
  annualShareChangePct: z.number().finite().min(-15).max(15).default(-1),
  terminalMultiple: z.number().finite().min(3).max(80).default(22),
  peMultiple: z.number().finite().min(3).max(80).optional(),
  evFcfMultiple: z.number().finite().min(3).max(80).optional(),
  evEbitMultiple: z.number().finite().min(2).max(60).optional(),
});
export type OperatingCaseDrivers = z.infer<typeof OperatingCaseDriversSchema>;

export const LinkedOperatingDriversSchema = z.object({
  bear: OperatingCaseDriversSchema,
  base: OperatingCaseDriversSchema,
  bull: OperatingCaseDriversSchema,
  cashRetentionPct: z.number().finite().min(0).max(100).default(70),
  treatSbcAsCashCost: z.boolean().optional(),
});
export type LinkedOperatingDrivers = z.infer<typeof LinkedOperatingDriversSchema>;

export const SecInsiderTxSchema = z.object({
  filingDate: z.string(),
  insiderName: z.string(),
  role: z.string(),
  code: z.enum(["P", "S", "M", "A", "G"]),
  shares: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative().nullable(),
  valueUsd: z.number().finite().nonnegative().nullable(),
  is10b51: z.boolean(),
});
export type SecInsiderTx = z.infer<typeof SecInsiderTxSchema>;

export const SecInsiderSignalSchema = z.enum([
  "cluster_buy",
  "net_buying",
  "routine_10b51",
  "discretionary_selling",
  "neutral",
]);
export type SecInsiderSignal = z.infer<typeof SecInsiderSignalSchema>;

export const SecInsiderSummarySchema = z.object({
  openMarketBuysCount: z.number().int().nonnegative(),
  openMarketBuysUsd: z.number().finite().nonnegative(),
  openMarketSalesCount: z.number().int().nonnegative(),
  openMarketSalesUsd: z.number().finite().nonnegative(),
  routine10b51SalesCount: z.number().int().nonnegative(),
  signal: SecInsiderSignalSchema,
  transactions: z.array(SecInsiderTxSchema).max(20),
});
export type SecInsiderSummary = z.infer<typeof SecInsiderSummarySchema>;

export const ResearchNoteKindSchema = z.enum([
  "earnings_call",
  "filing_note",
  "channel_check",
  "guidance_log",
]);
export type ResearchNoteKind = z.infer<typeof ResearchNoteKindSchema>;

export const ResearchNoteSchema = z.object({
  id: z.string().min(1),
  thesisId: z.string().min(1),
  kind: ResearchNoteKindSchema,
  periodLabel: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20_000),
  guidanceMetric: z.string().max(80).default(""),
  guidancePromised: z.string().max(160).default(""),
  guidanceDelivered: z.string().max(160).default(""),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ResearchNote = z.infer<typeof ResearchNoteSchema>;

export const CreateResearchNoteSchema = z.object({
  kind: ResearchNoteKindSchema.default("earnings_call"),
  periodLabel: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20_000),
  guidanceMetric: z.string().trim().max(80).optional().default(""),
  guidancePromised: z.string().trim().max(160).optional().default(""),
  guidanceDelivered: z.string().trim().max(160).optional().default(""),
});
export type CreateResearchNoteInput = z.input<typeof CreateResearchNoteSchema>;

export const UpdateResearchNoteSchema = z.object({
  noteId: z.string().min(1),
  kind: ResearchNoteKindSchema.optional(),
  periodLabel: z.string().trim().min(1).max(32).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(20_000).optional(),
  guidanceMetric: z.string().trim().max(80).optional(),
  guidancePromised: z.string().trim().max(160).optional(),
  guidanceDelivered: z.string().trim().max(160).optional(),
});
export type UpdateResearchNoteInput = z.input<typeof UpdateResearchNoteSchema>;

export const ReportingCurrencySchema = z.enum([
  "USD",
  "HKD",
  "CNY",
  "EUR",
  "JPY",
  "TWD",
  "GBP",
  "CHF",
  "KRW",
  "CAD",
  "DKK",
]);
export type ReportingCurrency = z.infer<typeof ReportingCurrencySchema>;

export const StreetConsensusSchema = z.object({
  source: z.enum(["live-market", "unavailable"]),
  fy1RevenueB: z.number().nullable(),
  fy2RevenueB: z.number().nullable(),
  fy1Eps: z.number().nullable(),
  fy2Eps: z.number().nullable(),
  impliedForwardPe: z.number().nullable(),
  revenueGrowthPct: z.number().nullable(),
  epsGrowthPct: z.number().nullable(),
  revisionTrend: z.enum(["up", "flat", "down", "unknown"]),
});
export type StreetConsensus = z.infer<typeof StreetConsensusSchema>;

export const HistoricalExtrapolationSchema = z.object({
  revenueCagrPct: z.number().nullable(),
  trailingEps: z.number().nullable(),
  extrapolatedFy1RevenueB: z.number().nullable(),
  extrapolatedFy1Eps: z.number().nullable(),
  impliedMultipleOnExtrapolatedEps: z.number().nullable(),
});
export type HistoricalExtrapolation = z.infer<typeof HistoricalExtrapolationSchema>;

export const ValuationBandSchema = z.object({
  metricLabel: z.enum(["P/E", "EV/FCF"]),
  current: z.number().nullable(),
  p10: z.number().nullable(),
  p50: z.number().nullable(),
  p90: z.number().nullable(),
  percentileRank: z.number().nullable(),
});
export type ValuationBand = z.infer<typeof ValuationBandSchema>;

export const PeerMultipleRangeSchema = z.object({
  metricLabel: z.enum(["P/E", "EV/FCF"]),
  current: z.number().nullable(),
  min: z.number().nullable(),
  median: z.number().nullable(),
  max: z.number().nullable(),
  sampleSize: z.number().int().nonnegative(),
});
export type PeerMultipleRange = z.infer<typeof PeerMultipleRangeSchema>;

export const IndustryPeerRowSchema = z.object({
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  sector: z.string(),
  price: z.number().nullable(),
  marketCapB: z.number().nullable(),
  revenueGrowthPct: z.number().nullable(),
  grossMarginPct: z.number().nullable(),
  roicPct: z.number().nullable(),
  forwardPe: z.number().nullable(),
  evFcf: z.number().nullable(),
  source: z.enum(["live-market", "sec-cached", "curated-reference"]),
});
export type IndustryPeerRow = z.infer<typeof IndustryPeerRowSchema>;

export const MarketBenchmarkResponseSchema = z.object({
  ticker: z.string().min(1),
  sectorLabel: z.string(),
  consensus: StreetConsensusSchema,
  historicalExtrapolation: HistoricalExtrapolationSchema.nullable().optional(),
  valuationBand: ValuationBandSchema.nullable(),
  peerMultipleRange: PeerMultipleRangeSchema.nullable().optional(),
  peers: z.array(IndustryPeerRowSchema),
  spyPrice: z.number().nullable(),
  fetchedAt: z.string(),
});
export type MarketBenchmarkResponse = z.infer<typeof MarketBenchmarkResponseSchema>;
