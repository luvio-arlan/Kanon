import { and, eq, sql } from "drizzle-orm";
import type { RedlineChange, RedlineSection, RedlineStats } from "../../../contracts/intel";
import type { KanonDb } from "../../bootstrap";
import { type FilingRedlineDbStatus, filingRedlinesTable } from "../../schema";

export interface StoredFilingRedline {
  currentAccession: string;
  previousAccession: string;
  sectionCode: RedlineSection;
  algoVersion: string;
  status: FilingRedlineDbStatus;
  stats: RedlineStats | null;
  changes: RedlineChange[];
  computedAt: string;
}

export async function getFilingRedline(
  db: KanonDb,
  params: {
    currentAccession: string;
    previousAccession: string;
    sectionCode: RedlineSection;
    algoVersion?: string;
  },
): Promise<StoredFilingRedline | null> {
  const algoVersion = params.algoVersion ?? "redline/2";
  const [row] = await db
    .select()
    .from(filingRedlinesTable)
    .where(
      and(
        eq(filingRedlinesTable.currentAccession, params.currentAccession),
        eq(filingRedlinesTable.previousAccession, params.previousAccession),
        eq(filingRedlinesTable.sectionCode, params.sectionCode),
        eq(filingRedlinesTable.algoVersion, algoVersion),
      ),
    )
    .limit(1);
  if (!row) return null;
  const stats =
    "added" in row.statsJson && typeof row.statsJson.added === "number"
      ? (row.statsJson as RedlineStats)
      : null;
  return {
    currentAccession: row.currentAccession,
    previousAccession: row.previousAccession,
    sectionCode: row.sectionCode,
    algoVersion: row.algoVersion,
    status: row.status,
    stats,
    changes: row.changesJson,
    computedAt: row.computedAt.toISOString(),
  };
}

export async function upsertFilingRedline(
  db: KanonDb,
  input: {
    currentAccession: string;
    previousAccession: string;
    sectionCode: RedlineSection;
    algoVersion?: string;
    status: FilingRedlineDbStatus;
    stats: RedlineStats | null;
    changes: readonly RedlineChange[];
  },
): Promise<void> {
  const algoVersion = input.algoVersion ?? "redline/2";
  const statsJson = input.stats ?? {};
  const changesJson = [...input.changes];
  await db
    .insert(filingRedlinesTable)
    .values({
      currentAccession: input.currentAccession,
      previousAccession: input.previousAccession,
      sectionCode: input.sectionCode,
      algoVersion,
      status: input.status,
      statsJson,
      changesJson,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        filingRedlinesTable.currentAccession,
        filingRedlinesTable.previousAccession,
        filingRedlinesTable.sectionCode,
        filingRedlinesTable.algoVersion,
      ],
      set: {
        status: input.status,
        statsJson,
        changesJson,
        computedAt: new Date(),
      },
    });
}

/**
 * Retains recent 3 annual + 6 quarterly periodic filings, recent 8 Form 8-K/6-K filings,
 * and every accession referenced by `filing_redlines` or `guidance_commitments` (U0-1 / G24).
 */
export async function pruneStaleFilingChunks(db: KanonDb): Promise<number> {
  const res = await db.execute(sql`
    WITH periodic AS (
      SELECT accession, security_id, filed_at,
        CASE WHEN form IN ('10-K', '10-K/A', '20-F', '20-F/A') THEN 'annual'
             WHEN form IN ('10-Q', '10-Q/A') THEN 'quarter' END AS bucket
      FROM filings
      WHERE form IN ('10-K', '10-K/A', '20-F', '20-F/A', '10-Q', '10-Q/A')
    ),
    ranked AS (
      SELECT accession, bucket,
        ROW_NUMBER() OVER (PARTITION BY security_id, bucket ORDER BY filed_at DESC) AS rn
      FROM periodic
    ),
    recent_8k AS (
      SELECT accession FROM (
        SELECT accession,
          ROW_NUMBER() OVER (PARTITION BY security_id ORDER BY filed_at DESC) AS rn
        FROM filings
        WHERE form IN ('8-K', '8-K/A', '6-K')
      ) x WHERE rn <= 8
    ),
    protected AS (
      SELECT current_accession AS accession FROM filing_redlines
      UNION
      SELECT previous_accession FROM filing_redlines
      UNION
      SELECT split_part(source_ref, ':', 1) FROM guidance_commitments
      WHERE source_kind = 'filing_chunk' AND source_ref IS NOT NULL
    ),
    keep AS (
      SELECT accession FROM ranked
      WHERE (bucket = 'annual' AND rn <= 3) OR (bucket = 'quarter' AND rn <= 6)
      UNION
      SELECT accession FROM recent_8k
      UNION
      SELECT accession FROM protected
    )
    DELETE FROM filing_chunks
    WHERE accession NOT IN (SELECT accession FROM keep)
    RETURNING id
  `);
  const rows = Array.isArray(res) ? res : res.rows;
  return rows.length;
}
