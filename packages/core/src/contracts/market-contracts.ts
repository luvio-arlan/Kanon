import { z } from "zod";

export const MarketSessionStateSchema = z.enum(["PRE", "REGULAR", "POST", "CLOSED"]);
export type MarketSessionState = z.infer<typeof MarketSessionStateSchema>;

export const MarketDataSourceSchema = z.enum(["yahoo", "finnhub", "fmp", "polygon"]);
export type MarketDataSource = z.infer<typeof MarketDataSourceSchema>;

export const MarketProviderPreferenceSchema = z.enum([
  "auto",
  "yahoo",
  "finnhub",
  "fmp",
  "polygon",
]);
export type MarketProviderPreference = z.infer<typeof MarketProviderPreferenceSchema>;

export const MarketProviderTierSchema = z.enum(["free", "paid"]);
export type MarketProviderTier = z.infer<typeof MarketProviderTierSchema>;

export const MarketQuoteSnapshotSchema = z.object({
  ticker: z.string().min(1).max(12),
  companyName: z.string().optional(),
  exchange: z.string().optional(),
  currency: z.string().default("USD"),
  sessionState: MarketSessionStateSchema,
  regularPrice: z.number().finite().positive(),
  previousClose: z.number().finite().positive().nullable(),
  regularChange: z.number().finite().nullable(),
  regularChangePct: z.number().finite().nullable(),
  preMarketPrice: z.number().finite().positive().nullable(),
  preMarketChange: z.number().finite().nullable(),
  preMarketChangePct: z.number().finite().nullable(),
  postMarketPrice: z.number().finite().positive().nullable(),
  postMarketChange: z.number().finite().nullable(),
  postMarketChangePct: z.number().finite().nullable(),
  effectivePrice: z.number().finite().positive(),
  dayHigh: z.number().finite().positive().nullable(),
  dayLow: z.number().finite().positive().nullable(),
  fiftyTwoWeekHigh: z.number().finite().positive().nullable(),
  fiftyTwoWeekLow: z.number().finite().positive().nullable(),
  fiftyTwoWeekPositionPct: z.number().finite().min(0).max(100).nullable(),
  volume: z.number().finite().nonnegative().nullable(),
  source: MarketDataSourceSchema,
  tier: MarketProviderTierSchema,
  asOf: z.string().min(1),
  latencyMs: z.number().nonnegative(),
});
export type MarketQuoteSnapshot = z.infer<typeof MarketQuoteSnapshotSchema>;

export const LocalMarketConfigSchema = z.object({
  provider: MarketProviderPreferenceSchema,
  apiKey: z.string().trim(),
});
export type LocalMarketConfig = z.infer<typeof LocalMarketConfigSchema>;

export const MarketQuotesResponseSchema = z.object({
  quotes: z.record(z.string(), MarketQuoteSnapshotSchema),
  missingTickers: z.array(z.string()),
  activeSource: z.union([MarketDataSourceSchema, z.literal("none")]),
  fetchedAt: z.string().min(1),
});
export type MarketQuotesResponse = z.infer<typeof MarketQuotesResponseSchema>;

export const MarketProviderTestRequestSchema = z.object({
  provider: MarketProviderPreferenceSchema,
  apiKey: z.string().trim().max(256).optional(),
  ticker: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((v) => v.toUpperCase())
    .default("NVDA"),
});
export type MarketProviderTestRequest = z.input<typeof MarketProviderTestRequestSchema>;

export const MarketProviderTestResponseSchema = z.object({
  ok: z.boolean(),
  provider: z.union([MarketDataSourceSchema, z.literal("none")]),
  tier: MarketProviderTierSchema,
  latencyMs: z.number().nonnegative(),
  quote: MarketQuoteSnapshotSchema.nullable(),
  message: z.string().min(1),
});
export type MarketProviderTestResponse = z.infer<typeof MarketProviderTestResponseSchema>;

export const RefreshPricesRequestSchema = z.object({
  mode: z.enum(["regular", "extended"]).default("regular"),
});
export type RefreshPricesRequest = z.input<typeof RefreshPricesRequestSchema>;
