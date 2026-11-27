import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
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

const FACT_UPSERT_CHUNK_SIZE = 500;

async function recomputeLatestFlagsForSecurities(db: KanonDb, securityIds: readonly string[]) {
  for (const securityId of securityIds) {
    await db.execute(sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY security_id, concept, period_end, duration
                 ORDER BY filed_at DESC, id DESC
               ) AS rn
        FROM financial_facts
        WHERE security_id = ${securityId}
      )
      UPDATE financial_facts f
      SET is_latest_for_period = (r.rn = 1)
      FROM ranked r
      WHERE f.id = r.id
        AND f.security_id = ${securityId}
        AND f.is_latest_for_period IS DISTINCT FROM (r.rn = 1)
    `);
  }
}

export async function upsertFinancialFacts(
  db: KanonDb,
  facts: readonly UpsertFinancialFactInput[],
): Promise<number> {
  if (facts.length === 0) return 0;
  const deduped = new Map<string, UpsertFinancialFactInput>();
  const touchedSecurities = new Set<string>();
  for (const f of facts) {
    deduped.set(f.id, f);
    touchedSecurities.add(f.securityId);
  }
  const rows = [...deduped.values()].map((f) => ({
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
  }));
  for (let i = 0; i < rows.length; i += FACT_UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + FACT_UPSERT_CHUNK_SIZE);
    await db
      .insert(financialFactsTable)
      .values(chunk)
      .onConflictDoUpdate({
        target: financialFactsTable.id,
        set: {
          value: sql`excluded.value`,
          filedAt: sql`excluded.filed_at`,
          xbrlTag: sql`excluded.xbrl_tag`,
        },
      });
  }
  await recomputeLatestFlagsForSecurities(db, [...touchedSecurities]);
  return rows.length;
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
