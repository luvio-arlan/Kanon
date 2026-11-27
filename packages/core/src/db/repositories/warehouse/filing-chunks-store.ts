import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { filingChunksTable } from "../../schema";

export interface FilingChunkInput {
  id: string;
  accession: string;
  ticker: string;
  sectionCode: string;
  paraIndex: number;
  text: string;
  charStart?: number;
  charEnd?: number;
  normHash?: string;
  extractVersion?: string;
}

export interface FtsChunkRow {
  id: string;
  accession: string;
  sectionCode: string;
  paraIndex: number;
  text: string;
  rank: number;
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

export async function upsertFilingChunks(
  db: KanonDb,
  chunks: readonly FilingChunkInput[],
): Promise<number> {
  for (const c of chunks) {
    const contentHash = sha256Text(c.text);
    const [existing] = await db
      .select({ contentHash: filingChunksTable.contentHash })
      .from(filingChunksTable)
      .where(eq(filingChunksTable.id, c.id))
      .limit(1);
    if (existing && existing.contentHash === contentHash) continue;

    await db
      .insert(filingChunksTable)
      .values({
        id: c.id,
        accession: c.accession,
        ticker: c.ticker.trim().toUpperCase(),
        sectionCode: c.sectionCode,
        paraIndex: c.paraIndex,
        text: c.text,
        charStart: c.charStart ?? 0,
        charEnd: c.charEnd ?? c.text.length,
        contentHash,
        normHash: c.normHash ?? "",
        extractVersion: c.extractVersion ?? "reader/1",
        embeddingJson: null,
      })
      .onConflictDoUpdate({
        target: filingChunksTable.id,
        set: {
          text: c.text,
          charStart: c.charStart ?? 0,
          charEnd: c.charEnd ?? c.text.length,
          contentHash,
          normHash: c.normHash ?? "",
          extractVersion: c.extractVersion ?? "reader/1",
        },
      });
  }
  return chunks.length;
}

/** Upserts full-section filing chunks with `norm_hash` and `extract_version = 'sections/1'` (R1/R4). */
export async function upsertSectionChunks(
  db: KanonDb,
  chunks: readonly (FilingChunkInput & { normHash: string })[],
): Promise<number> {
  return upsertFilingChunks(
    db,
    chunks.map((c) => ({ ...c, extractVersion: "sections/1" })),
  );
}

/**
 * Full-text search over `filing_chunks` using the exact expression matching `idx_filing_chunks_fts`
 * (`to_tsvector('english', text)` + `websearch_to_tsquery`). Replaces substring `ILIKE` retrieval (R4 / G18).
 */
export async function searchFilingChunksFts(
  db: KanonDb,
  params: {
    ticker: string;
    tsQuery: string;
    accessions?: readonly string[];
    extractVersion?: string;
    limit?: number;
  },
): Promise<FtsChunkRow[]> {
  const query = params.tsQuery.trim();
  if (!query) return [];
  const upper = params.ticker.trim().toUpperCase();
  const limit = Math.max(1, Math.min(80, params.limit ?? 60));
  const conds = [
    eq(filingChunksTable.ticker, upper),
    sql`to_tsvector('english', ${filingChunksTable.text}) @@ websearch_to_tsquery('english', ${query})`,
  ];
  if (params.extractVersion) {
    conds.push(eq(filingChunksTable.extractVersion, params.extractVersion));
  }
  if (params.accessions && params.accessions.length > 0) {
    conds.push(inArray(filingChunksTable.accession, [...params.accessions]));
  }
  const rankExpr = sql<number>`ts_rank_cd(to_tsvector('english', ${filingChunksTable.text}), websearch_to_tsquery('english', ${query}))`;
  const rows = await db
    .select({
      id: filingChunksTable.id,
      accession: filingChunksTable.accession,
      sectionCode: filingChunksTable.sectionCode,
      paraIndex: filingChunksTable.paraIndex,
      text: filingChunksTable.text,
      rank: rankExpr,
    })
    .from(filingChunksTable)
    .where(and(...conds))
    .orderBy(sql`${rankExpr} DESC`)
    .limit(limit);
  return rows.map((r) => ({ ...r, rank: Number(r.rank ?? 0) }));
}
