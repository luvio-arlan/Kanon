import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { FinancialFactDuration } from "../../../contracts/financial-concepts";
import { roundTo } from "../../../math/valuation-scenarios";
import type { KanonDb } from "../../bootstrap";
import { filingsTable, financialFactsTable } from "../../schema";
import type {
  FactRestatement,
  PitFinancialFact,
  UpsertFilingInput,
  UpsertFinancialFactInput,
} from "./facts-pit-types";

export type {
  FactRestatement,
  PitFinancialFact,
  UpsertFilingInput,
  UpsertFinancialFactInput,
} from "./facts-pit-types";

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

async function recomputeLatestFlagsForKeys(
  db: KanonDb,
  keys: readonly {
    securityId: string;
    concept: string;
    periodEnd: string;
    duration: FinancialFactDuration;
  }[],
) {
  for (const key of keys) {
    const rows = await db
      .select({ id: financialFactsTable.id, filedAt: financialFactsTable.filedAt })
      .from(financialFactsTable)
      .where(
        and(
          eq(financialFactsTable.securityId, key.securityId),
          eq(financialFactsTable.concept, key.concept),
          eq(financialFactsTable.periodEnd, key.periodEnd),
          eq(financialFactsTable.duration, key.duration),
        ),
      )
      .orderBy(desc(financialFactsTable.filedAt), desc(financialFactsTable.id));
    const latestId = rows[0]?.id;
    if (!latestId) continue;
    await db
      .update(financialFactsTable)
      .set({ isLatestForPeriod: false })
      .where(
        and(
          eq(financialFactsTable.securityId, key.securityId),
          eq(financialFactsTable.concept, key.concept),
          eq(financialFactsTable.periodEnd, key.periodEnd),
          eq(financialFactsTable.duration, key.duration),
        ),
      );
    await db
      .update(financialFactsTable)
      .set({ isLatestForPeriod: true })
      .where(
        and(
          eq(financialFactsTable.id, latestId),
          eq(financialFactsTable.securityId, key.securityId),
        ),
      );
  }
}

export async function upsertFinancialFacts(
  db: KanonDb,
  facts: readonly UpsertFinancialFactInput[],
): Promise<number> {
  const touched = new Map<
    string,
    { securityId: string; concept: string; periodEnd: string; duration: FinancialFactDuration }
  >();
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
        isLatestForPeriod: false,
      })
      .onConflictDoUpdate({
        target: financialFactsTable.id,
        set: { value: f.value, filedAt: f.filedAt, xbrlTag: f.xbrlTag },
      });
    touched.set(`${f.securityId}:${f.concept}:${f.periodEnd}:${f.duration}`, {
      securityId: f.securityId,
      concept: f.concept,
      periodEnd: f.periodEnd,
      duration: f.duration,
    });
  }
  await recomputeLatestFlagsForKeys(db, [...touched.values()]);
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
