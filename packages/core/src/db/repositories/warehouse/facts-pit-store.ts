import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { FinancialFactDuration } from "../../../contracts/financial-concepts";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import { filingsTable, financialFactsTable } from "../../schema";

export interface UpsertFilingInput {
  accession: string;
  securityId: string;
  cik: string;
  form: string;
  filedAt: string;
  periodEnd?: string | null;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  items?: string[];
  primaryDocUrl: string;
  amendsAccession?: string | null;
  parseStatus?: string;
}

export interface UpsertFinancialFactInput {
  id: string;
  securityId: string;
  accession: string;
  concept: string;
  xbrlTag: string;
  taxonomy?: string;
  periodStart?: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear?: number | null;
  fiscalPeriod?: string | null;
  value: number;
  unit?: string;
  currency?: string;
  dimensions?: Record<string, string>;
  filedAt: string;
  isLatestForPeriod?: boolean;
}

export interface PitFinancialFact {
  id: string;
  accession: string;
  concept: string;
  xbrlTag: string;
  taxonomy: string;
  periodStart: string | null;
  periodEnd: string;
  duration: FinancialFactDuration;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  value: number;
  unit: string;
  currency: string;
  filedAt: string;
}

export interface FactRestatement {
  concept: string;
  periodEnd: string;
  originalAccession: string;
  originalFiledAt: string;
  originalValue: number;
  restatedAccession: string;
  restatedFiledAt: string;
  restatedValue: number;
  deltaPct: number;
}

export async function upsertFiling(db: KanonDb, input: UpsertFilingInput): Promise<void> {
  await db
    .insert(filingsTable)
    .values({
      accession: input.accession,
      securityId: input.securityId,
      cik: input.cik,
      form: input.form,
      filedAt: input.filedAt,
      periodEnd: input.periodEnd ?? null,
      fiscalYear: input.fiscalYear ?? null,
      fiscalPeriod: input.fiscalPeriod ?? null,
      items: input.items ?? [],
      primaryDocUrl: input.primaryDocUrl,
      amendsAccession: input.amendsAccession ?? null,
      parseStatus: input.parseStatus ?? "parsed",
    })
    .onConflictDoUpdate({
      target: filingsTable.accession,
      set: {
        items: input.items ?? [],
        parseStatus: input.parseStatus ?? "parsed",
        amendsAccession: input.amendsAccession ?? null,
      },
    });
}

export async function listFilingsBySecurity(db: KanonDb, securityId: string, limit = 20) {
  return db
    .select()
    .from(filingsTable)
    .where(eq(filingsTable.securityId, securityId))
    .orderBy(desc(filingsTable.filedAt))
    .limit(limit);
}

export async function upsertFinancialFacts(
  db: KanonDb,
  facts: readonly UpsertFinancialFactInput[],
): Promise<number> {
  for (const f of facts) {
    await db
      .insert(financialFactsTable)
      .values({
        id: f.id,
        securityId: f.securityId,
        accession: f.accession,
        concept: f.concept,
        xbrlTag: f.xbrlTag,
        taxonomy: f.taxonomy ?? "us-gaap",
        periodStart: f.periodStart ?? null,
        periodEnd: f.periodEnd,
        duration: f.duration,
        fiscalYear: f.fiscalYear ?? null,
        fiscalPeriod: f.fiscalPeriod ?? null,
        value: f.value,
        unit: f.unit ?? "USD",
        currency: f.currency ?? "USD",
        dimensions: f.dimensions ?? {},
        filedAt: f.filedAt,
        isLatestForPeriod: f.isLatestForPeriod ?? true,
      })
      .onConflictDoUpdate({
        target: financialFactsTable.id,
        set: { value: f.value, isLatestForPeriod: f.isLatestForPeriod ?? true },
      });
  }
  return facts.length;
}

/**
 * Point-in-Time (as-of) query: returns only facts filed on or before `asOfDate`,
 * picking the most recently filed value per `periodEnd` to prevent look-ahead bias.
 */
export async function getFactsAsOf(
  db: KanonDb,
  params: {
    securityId: string;
    concept: string;
    asOfDate: string;
    duration?: FinancialFactDuration;
  },
): Promise<PitFinancialFact[]> {
  const conds = [
    eq(financialFactsTable.securityId, params.securityId),
    eq(financialFactsTable.concept, params.concept),
    lte(financialFactsTable.filedAt, params.asOfDate),
  ];
  if (params.duration) conds.push(eq(financialFactsTable.duration, params.duration));
  const rows = await db
    .select()
    .from(financialFactsTable)
    .where(and(...conds))
    .orderBy(asc(financialFactsTable.periodEnd), asc(financialFactsTable.filedAt));
  const latestByPeriod = new Map<string, PitFinancialFact>();
  for (const row of rows) {
    latestByPeriod.set(row.periodEnd, row);
  }
  return [...latestByPeriod.values()];
}

/** Detects restatements (> `thresholdPct`, default 0.5%) across filings for the same `periodEnd`. */
export async function detectFactRestatements(
  db: KanonDb,
  params: { securityId: string; concept: string; thresholdPct?: number },
): Promise<FactRestatement[]> {
  const threshold = params.thresholdPct ?? 0.5;
  const rows = await db
    .select()
    .from(financialFactsTable)
    .where(
      and(
        eq(financialFactsTable.securityId, params.securityId),
        eq(financialFactsTable.concept, params.concept),
      ),
    )
    .orderBy(asc(financialFactsTable.periodEnd), asc(financialFactsTable.filedAt));
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = grouped.get(r.periodEnd) ?? [];
    list.push(r);
    grouped.set(r.periodEnd, list);
  }
  const alerts: FactRestatement[] = [];
  for (const [periodEnd, list] of grouped.entries()) {
    if (list.length < 2) continue;
    const orig = list[0];
    const latest = list[list.length - 1];
    if (!orig || !latest || orig.value === 0) continue;
    const deltaPct = ((latest.value - orig.value) / Math.abs(orig.value)) * 100;
    if (Math.abs(deltaPct) >= threshold) {
      alerts.push({
        concept: params.concept,
        periodEnd,
        originalAccession: orig.accession,
        originalFiledAt: orig.filedAt,
        originalValue: orig.value,
        restatedAccession: latest.accession,
        restatedFiledAt: latest.filedAt,
        restatedValue: latest.value,
        deltaPct: roundTo(deltaPct, 2),
      });
    }
  }
  return alerts;
}

/** Derives standalone Q4 flow metric from 10-K full-year minus 9M YTD (3Q cumulative). */
export function deriveQ4FromAnnualAndYtd(params: {
  annualValue: number;
  nineMonthYtdValue: number;
}): number {
  return roundTo(params.annualValue - params.nineMonthYtdValue, 6);
}
