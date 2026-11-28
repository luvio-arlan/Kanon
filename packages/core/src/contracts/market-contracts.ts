import { z } from "zod";
import { type DataLicenseClass, DataLicenseClassSchema } from "./intel/primitives";

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
  licenseClass: DataLicenseClassSchema.optional(),
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

export interface MarketProviderLicenseMeta {
  provider: MarketDataSource;
  displayName: string;
  licenseClass: DataLicenseClass;
  licensedForProduction: boolean;
  badgeLabel: string;
  notice: string;
}

export function getDataSourceLicenseClass(source: string): DataLicenseClass {
  const s = source.trim().toLowerCase();
  if (s === "polygon" || s === "fmp" || s === "finnhub") return "licensed";
  if (s === "sec" || s === "ecb" || s === "ecb_reference") return "public_reference";
  return "unofficial";
}

export const MARKET_PROVIDER_LICENSES: Record<MarketDataSource, MarketProviderLicenseMeta> = {
  yahoo: {
    provider: "yahoo",
    displayName: "Yahoo Finance (v8/chart)",
    licenseClass: "unofficial",
    licensedForProduction: false,
    badgeLabel: "非授权参考源",
    notice: "非官方免费接口，仅推荐本地开发或个人研究参考；生产机构使用请切换商业授权数据源。",
  },
  finnhub: {
    provider: "finnhub",
    displayName: "Finnhub",
    licenseClass: "licensed",
    licensedForProduction: true,
    badgeLabel: "商业授权通道",
    notice: "官方授权 API 通道，按用户自有订阅条款提供实时报价与公司指标。",
  },
  fmp: {
    provider: "fmp",
    displayName: "Financial Modeling Prep",
    licenseClass: "licensed",
    licensedForProduction: true,
    badgeLabel: "商业授权通道",
    notice: "官方授权基本面与盘后行情 API，支持扩展时段成交与财务数据。",
  },
  polygon: {
    provider: "polygon",
    displayName: "Polygon.io (Massive)",
    licenseClass: "licensed",
    licensedForProduction: true,
    badgeLabel: "机构授权通道",
    notice: "官方美股 SIP 商业授权快照与历史日线通道，适用于生产环境。",
  },
};
