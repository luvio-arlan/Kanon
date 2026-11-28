import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  type CurrencyCode,
  CurrencyCodeSchema,
  type FxSource,
  inferCurrencyFromTicker,
} from "../../../contracts/intel/primitives";
import type { KanonDb } from "../../bootstrap";
import { fxRatesDailyTable, securitiesTable } from "../../schema";
import { LedgerPolicyError } from "../workflows/ledger-fifo-helpers";

export interface DailyUsdPerUnitRate {
  rateDate: string;
  usdPerUnit: number;
}

const DEFAULT_LOOKBACK_CALENDAR_DAYS = 7;

function shiftCalendarDays(isoDate: string, deltaDays: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + deltaDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function latestUsdPerUnit(
  db: KanonDb,
  currency: CurrencyCode,
  asOfDate: string,
  lookbackDays: number,
): Promise<number | null> {
  if (currency === "USD") return 1;
  const minDate = shiftCalendarDays(asOfDate, -lookbackDays);
  const [row] = await db
    .select({ usdPerUnit: fxRatesDailyTable.usdPerUnit })
    .from(fxRatesDailyTable)
    .where(
      and(
        eq(fxRatesDailyTable.currency, currency),
        lte(fxRatesDailyTable.rateDate, asOfDate),
        gte(fxRatesDailyTable.rateDate, minDate),
      ),
    )
    .orderBy(desc(fxRatesDailyTable.rateDate))
    .limit(1);
  return row && Number.isFinite(row.usdPerUnit) && row.usdPerUnit > 0 ? row.usdPerUnit : null;
}

/**
 * Looks up cross FX rate `X_{from -> to}` on or before `asOfDate` (within <= 5 business / 7 calendar days).
 * Returns `null` when unavailable so callers fail closed with 409 `FX_UNAVAILABLE` (U1-1).
 */
export async function lookupFxToBaseOnDate(
  db: KanonDb,
  params: {
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    asOfDate: string;
    lookbackDays?: number;
  },
): Promise<{ rate: number; source: FxSource } | null> {
  if (params.fromCurrency === params.toCurrency) {
    return { rate: 1, source: "identity" };
  }
  const lookback = params.lookbackDays ?? DEFAULT_LOOKBACK_CALENDAR_DAYS;
  const [fromUsd, toUsd] = await Promise.all([
    latestUsdPerUnit(db, params.fromCurrency, params.asOfDate, lookback),
    latestUsdPerUnit(db, params.toCurrency, params.asOfDate, lookback),
  ]);
  if (fromUsd === null || toUsd === null) return null;
  return { rate: fromUsd / toUsd, source: "ecb_reference" };
}

/** Loads historical daily `usd_per_unit` series for the requested currencies sorted ascending by date. */
export async function loadFxRatesHistory(
  db: KanonDb,
  currencies: readonly string[],
): Promise<Map<string, DailyUsdPerUnitRate[]>> {
  const unique = [
    ...new Set(currencies.map((c) => c.trim().toUpperCase()).filter((c) => c && c !== "USD")),
  ];
  const map = new Map<string, DailyUsdPerUnitRate[]>();
  if (unique.length === 0) return map;
  const rows = await db
    .select({
      currency: fxRatesDailyTable.currency,
      rateDate: fxRatesDailyTable.rateDate,
      usdPerUnit: fxRatesDailyTable.usdPerUnit,
    })
    .from(fxRatesDailyTable)
    .where(inArray(fxRatesDailyTable.currency, unique))
    .orderBy(asc(fxRatesDailyTable.rateDate));
  for (const r of rows) {
    if (!Number.isFinite(r.usdPerUnit) || r.usdPerUnit <= 0) continue;
    const arr = map.get(r.currency) ?? [];
    arr.push({ rateDate: r.rateDate, usdPerUnit: r.usdPerUnit });
    map.set(r.currency, arr);
  }
  return map;
}

async function resolveTradeCurrency(
  tx: KanonDb,
  baseCurrency: CurrencyCode,
  ticker: string,
  explicit?: CurrencyCode,
): Promise<CurrencyCode> {
  if (explicit) return explicit;
  if (ticker === "CASH") return baseCurrency;
  const [sec] = await tx
    .select({ tradingCurrency: securitiesTable.tradingCurrency })
    .from(securitiesTable)
    .where(eq(securitiesTable.ticker, ticker))
    .limit(1);
  const parsedSec = CurrencyCodeSchema.safeParse(sec?.tradingCurrency ?? "");
  const resolved = parsedSec.success ? parsedSec.data : inferCurrencyFromTicker(ticker);
  if (!resolved) {
    throw new LedgerPolicyError("CURRENCY_UNSUPPORTED", `暂不支持 ${ticker} 的交易币种。`, 400);
  }
  return resolved;
}

/** Resolves trade currency + FX rate to account base currency, throwing 409 FX_UNAVAILABLE when absent (U1-1). */
export async function resolveTxCurrencyAndFx(
  tx: KanonDb,
  params: {
    baseCurrency: CurrencyCode;
    ticker: string;
    tradeDate: string;
    tradeCurrency?: CurrencyCode;
    fxToBase?: number;
    fxSource?: FxSource;
  },
): Promise<{ tradeCurrency: CurrencyCode; fxToBase: number; fxSource: FxSource }> {
  const tradeCurrency = await resolveTradeCurrency(
    tx,
    params.baseCurrency,
    params.ticker,
    params.tradeCurrency,
  );
  if (params.fxToBase !== undefined) {
    return {
      tradeCurrency,
      fxToBase: params.fxToBase,
      fxSource: params.fxSource ?? (tradeCurrency === params.baseCurrency ? "identity" : "broker"),
    };
  }
  const looked = await lookupFxToBaseOnDate(tx, {
    fromCurrency: tradeCurrency,
    toCurrency: params.baseCurrency,
    asOfDate: params.tradeDate,
  });
  if (!looked) {
    throw new LedgerPolicyError(
      "FX_UNAVAILABLE",
      `缺少 ${tradeCurrency}/${params.baseCurrency} 在 ${params.tradeDate} 附近的 ECB 参考汇率，请手动填写券商成交汇率或先同步汇率。`,
      409,
    );
  }
  return { tradeCurrency, fxToBase: looked.rate, fxSource: looked.source };
}
