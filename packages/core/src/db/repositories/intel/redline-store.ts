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
  const algoVersion = params.algoVersion ?? "redline/1";
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
  const algoVersion = input.algoVersion ?? "redline/1";
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

/** Retains only the most recent 2 annual + 4 quarterly filings' chunks per security (R1 storage budget). */
export async function pruneStaleFilingChunks(db: KanonDb): Promise<number> {
  const res = await db.execute(sql`
    WITH ranked AS (
      SELECT accession, security_id,
        CASE WHEN form IN ('10-K', '10-K/A', '20-F', '20-F/A') THEN 'annual' ELSE 'quarter' END AS bucket,
        ROW_NUMBER() OVER (
          PARTITION BY security_id,
            CASE WHEN form IN ('10-K', '10-K/A', '20-F', '20-F/A') THEN 'annual' ELSE 'quarter' END
          ORDER BY filed_at DESC
        ) AS rn
      FROM filings
    ),
    keep_acc AS (
      SELECT accession FROM ranked
      WHERE (bucket = 'annual' AND rn <= 2) OR (bucket = 'quarter' AND rn <= 4)
    )
    DELETE FROM filing_chunks
    WHERE accession NOT IN (SELECT accession FROM keep_acc)
    RETURNING id
  `);
  const rows = Array.isArray(res) ? res : res.rows;
  return rows.length;
}
