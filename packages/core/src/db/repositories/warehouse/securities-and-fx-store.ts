import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { fxRatesDailyTable, type SecuritySecStatus, securitiesTable } from "../../schema";

export interface UpsertSecurityInput {
  id?: string;
  ticker: string;
  exchangeMic?: string;
  cik?: string | null;
  name: string;
  shareClass?: string | null;
  currency?: string;
  country?: string;
  adrRatio?: number;
  adrRatioSource?: string;
  sectorCode?: string | null;
  industryCode?: string | null;
  isActive?: boolean;
  secStatus?: SecuritySecStatus;
  listedAt?: string | null;
  delistedAt?: string | null;
}

export interface SecurityRecord {
  id: string;
  ticker: string;
  exchangeMic: string;
  cik: string | null;
  name: string;
  shareClass: string | null;
  currency: string;
  country: string;
  adrRatio: number;
  adrRatioSource: string;
  sectorCode: string | null;
  industryCode: string | null;
  isActive: boolean;
  secStatus: SecuritySecStatus;
  listedAt: string | null;
  delistedAt: string | null;
}

export function buildSecurityId(ticker: string, exchangeMic = "XNAS"): string {
  return `sec:${exchangeMic.trim().toUpperCase()}:${ticker.trim().toUpperCase()}`;
}

function normalizeSecurityFields(input: UpsertSecurityInput) {
  return {
    cik: input.cik?.trim() || null,
    name: input.name.trim(),
    shareClass: input.shareClass?.trim() || null,
    currency: (input.currency ?? "USD").trim().toUpperCase(),
    country: (input.country ?? "US").trim().toUpperCase(),
    adrRatio: input.adrRatio ?? 1,
    adrRatioSource: input.adrRatioSource ?? "default",
    sectorCode: input.sectorCode ?? null,
    industryCode: input.industryCode ?? null,
    isActive: input.isActive ?? true,
    secStatus: input.secStatus ?? "active",
    listedAt: input.listedAt ?? null,
    delistedAt: input.delistedAt ?? null,
    updatedAt: new Date(),
  };
}

function buildPartialSecurityUpdate(input: UpsertSecurityInput) {
  const nameClean = input.name.trim();
  const hasRealName =
    Boolean(nameClean) && nameClean.toUpperCase() !== input.ticker.trim().toUpperCase();
  const entries: Array<[keyof typeof securitiesTable.$inferInsert, unknown]> = [
    ["updatedAt", new Date()],
    ["cik", input.cik !== undefined ? input.cik?.trim() || null : undefined],
    ["name", hasRealName ? nameClean : undefined],
    ["shareClass", input.shareClass !== undefined ? input.shareClass?.trim() || null : undefined],
    ["currency", input.currency !== undefined ? input.currency.trim().toUpperCase() : undefined],
    ["country", input.country !== undefined ? input.country.trim().toUpperCase() : undefined],
    ["adrRatio", input.adrRatio],
    ["adrRatioSource", input.adrRatioSource],
    ["sectorCode", input.sectorCode],
    ["industryCode", input.industryCode],
    ["isActive", input.isActive],
    ["secStatus", input.secStatus],
    ["listedAt", input.listedAt],
    ["delistedAt", input.delistedAt],
  ];
  const patch: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (v !== undefined) patch[k] = v;
  }
  return patch as Partial<typeof securitiesTable.$inferInsert>;
}

export async function upsertSecurity(
  db: KanonDb,
  input: UpsertSecurityInput,
): Promise<SecurityRecord> {
  const ticker = input.ticker.trim().toUpperCase();
  const exchangeMic = (input.exchangeMic ?? "XNAS").trim().toUpperCase();
  const id = input.id?.trim() || buildSecurityId(ticker, exchangeMic);
  const insertFields = normalizeSecurityFields(input);
  const partialPatch = buildPartialSecurityUpdate(input);
  await db
    .insert(securitiesTable)
    .values({ id, ticker, exchangeMic, ...insertFields })
    .onConflictDoUpdate({
      target: [securitiesTable.ticker, securitiesTable.exchangeMic],
      set: partialPatch,
    });
  const found = await getSecurityByTicker(db, ticker, exchangeMic);
  if (!found) throw new Error(`Failed to read upserted security ${ticker}`);
  return found;
}

export async function getSecurityByTicker(
  db: KanonDb,
  ticker: string,
  exchangeMic?: string,
): Promise<SecurityRecord | null> {
  const upper = ticker.trim().toUpperCase();
  const cond = exchangeMic
    ? and(
        eq(securitiesTable.ticker, upper),
        eq(securitiesTable.exchangeMic, exchangeMic.trim().toUpperCase()),
      )
    : eq(securitiesTable.ticker, upper);
  const [row] = await db.select().from(securitiesTable).where(cond).limit(1);
  return row ?? null;
}

export async function markSecuritySecStatus(
  db: KanonDb,
  ticker: string,
  secStatus: SecuritySecStatus,
): Promise<void> {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return;
  const existing = await getSecurityByTicker(db, upper);
  if (existing) {
    await db
      .update(securitiesTable)
      .set({ secStatus, updatedAt: new Date() })
      .where(eq(securitiesTable.id, existing.id));
    return;
  }
  await upsertSecurity(db, { ticker: upper, name: upper, secStatus });
}

export async function listSecuritiesByCik(db: KanonDb, cik: string): Promise<SecurityRecord[]> {
  return db
    .select()
    .from(securitiesTable)
    .where(eq(securitiesTable.cik, cik.trim()))
    .orderBy(asc(securitiesTable.ticker));
}

export interface FxRateInput {
  currency: string;
  rateDate: string;
  usdPerUnit: number;
  source?: string;
  sourceLicense?: string;
}

export async function upsertFxRates(db: KanonDb, rates: readonly FxRateInput[]): Promise<number> {
  if (rates.length === 0) return 0;
  for (const rate of rates) {
    if (!Number.isFinite(rate.usdPerUnit) || rate.usdPerUnit <= 0) continue;
    const currency = rate.currency.trim().toUpperCase();
    await db
      .insert(fxRatesDailyTable)
      .values({
        currency,
        rateDate: rate.rateDate,
        usdPerUnit: rate.usdPerUnit,
        source: rate.source ?? "ecb",
        sourceLicense: rate.sourceLicense ?? "ecb_reference",
      })
      .onConflictDoUpdate({
        target: [fxRatesDailyTable.currency, fxRatesDailyTable.rateDate],
        set: {
          usdPerUnit: rate.usdPerUnit,
          source: rate.source ?? "ecb",
          sourceLicense: rate.sourceLicense ?? "ecb_reference",
        },
      });
  }
  return rates.length;
}

/** Balance sheet items convert at period-end (latest rate on or before `asOfDate`). */
export async function getPeriodEndFxRate(
  db: KanonDb,
  currency: string,
  asOfDate: string,
): Promise<{ usdPerUnit: number; rateDate: string; source: string } | null> {
  const upper = currency.trim().toUpperCase();
  if (upper === "USD") return { usdPerUnit: 1, rateDate: asOfDate, source: "identity" };
  const [row] = await db
    .select()
    .from(fxRatesDailyTable)
    .where(and(eq(fxRatesDailyTable.currency, upper), lte(fxRatesDailyTable.rateDate, asOfDate)))
    .orderBy(desc(fxRatesDailyTable.rateDate))
    .limit(1);
  if (!row) return null;
  return { usdPerUnit: row.usdPerUnit, rateDate: row.rateDate, source: row.source };
}

/** Flow items (income/cashflow) convert at period-average daily FX between [start, end]. */
export async function getPeriodAverageFxRate(
  db: KanonDb,
  currency: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ usdPerUnit: number; sampleCount: number } | null> {
  const upper = currency.trim().toUpperCase();
  if (upper === "USD") return { usdPerUnit: 1, sampleCount: 1 };
  const rows = await db
    .select({ usdPerUnit: fxRatesDailyTable.usdPerUnit })
    .from(fxRatesDailyTable)
    .where(
      and(
        eq(fxRatesDailyTable.currency, upper),
        gte(fxRatesDailyTable.rateDate, periodStart),
        lte(fxRatesDailyTable.rateDate, periodEnd),
      ),
    );
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + r.usdPerUnit, 0);
  return { usdPerUnit: sum / rows.length, sampleCount: rows.length };
}
